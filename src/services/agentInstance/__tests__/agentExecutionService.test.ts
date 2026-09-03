import type { AgentInstanceState, AgentLoopStep, MemeLoopRuntimeUpdate } from 'memeloop';
import { resolveAgentToolLoopTerminalState } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { AgentInstanceService } from '../index';

describe('AgentInstanceService durable execution IPC', () => {
  const attachmentReference = {
    contentHash: `sha256:${'a'.repeat(64)}`,
    filename: 'authorized.png',
    mimeType: 'image/png',
    size: 4,
  } as const;

  it.each(
    [
      ['input-required', 'input-required'],
      ['max-iterations', 'completed'],
      ['blocked', 'failed'],
      ['cancelled', 'canceled'],
    ] as const,
  )('uses Core terminal projection for %s', (status, expected) => {
    const step: AgentLoopStep = { type: 'thinking', data: { status } };
    expect(resolveAgentToolLoopTerminalState(step, 'completed')).toBe(expected satisfies AgentInstanceState);
  });

  it('projects a streamed Core input-required state without decoding step payloads in Desktop', async () => {
    const statuses: string[] = [];
    let listener: ((update: MemeLoopRuntimeUpdate) => void) | undefined;
    const runtime = {
      subscribeToUpdates: vi.fn((_conversationId: string, next: (update: MemeLoopRuntimeUpdate) => void) => {
        listener = next;
        return vi.fn();
      }),
      sendMessage: vi.fn(async () => {
        listener?.({
          type: 'agent-step',
          conversationId: 'conversation-1',
          runId: 'run-1',
          step: { type: 'thinking', data: { status: 'input-required' } },
        });
        return {
          runId: 'run-1',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          requestId: 'request-1',
          state: 'accepted' as const,
        };
      }),
    };
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    Object.assign(service as unknown as Record<string, unknown>, {
      deviceNetworkService: { getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }) },
      agentDefinitionService: { getAgentDef: vi.fn().mockResolvedValue({ id: 'definition-1' }) },
      getAgentMetadata: vi.fn().mockResolvedValue({ id: 'conversation-1', agentDefId: 'definition-1' }),
      getAgentMessage: vi.fn().mockResolvedValue(undefined),
      createAgentDeviceRpcRunTurn: vi.fn().mockResolvedValue({
        conversationId: 'conversation-1',
        definitionId: 'definition-1',
        requestId: 'request-1',
        turnId: 'turn-1',
        message: 'hello',
      }),
      captureBeforeTurnCommitMap: vi.fn().mockResolvedValue({}),
      updateAgentStatusBestEffort: vi.fn(async (_agentId: string, status: { state: string }) => {
        statuses.push(status.state);
      }),
      getDurableAgentRuntime: vi.fn().mockResolvedValue(runtime),
      waitForDurableRun: vi.fn().mockResolvedValue({
        runId: 'run-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        requestId: 'request-1',
        state: 'completed',
      }),
      activeDurableRunIds: new Map(),
    });

    await service.executeLocalAgentMessage({
      target: { kind: 'local' },
      provenance: {
        conversationId: 'conversation-1',
        definitionId: 'definition-1',
        requestId: 'request-1',
        turnId: 'turn-1',
      },
      message: 'hello',
    });

    expect(statuses).toEqual(['working', 'input-required']);
  });

  it('preserves caller provenance and materializes the exact local user-root message', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      requestId: 'request-1',
      state: 'accepted',
    });
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    const mutable = service as unknown as Record<string, unknown>;
    mutable.deviceNetworkService = { getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }) };
    mutable.agentDefinitionService = {
      getAgentDef: vi.fn().mockResolvedValue({
        id: 'definition-1',
        modelConfig: { providerId: 'cpa', modelId: 'model-1' },
      }),
    };
    mutable.getAgentMetadata = vi.fn().mockResolvedValue({
      id: 'conversation-1',
      agentDefId: 'definition-1',
    });
    mutable.getDurableAgentRuntime = vi.fn().mockResolvedValue({ sendMessage });

    await expect(service.executeAgentRun({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      message: 'hello',
      requestId: 'request-1',
      turnId: 'turn-1',
      userMessage: { content: 'hello' },
    })).resolves.toEqual(expect.objectContaining({ runId: 'run-1' }));

    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      message: 'hello',
      requestId: 'request-1',
      turnId: 'turn-1',
      requestPeerId: 'peer-local',
      userMessage: expect.objectContaining({
        messageId: 'turn-1',
        turnId: 'turn-1',
        originNodeId: 'peer-local',
        content: 'hello',
      }),
    });
    const durableInput = sendMessage.mock.calls[0]?.[0];
    expect(JSON.parse(JSON.stringify(durableInput))).toStrictEqual(durableInput);
  });

  it('rejects a renderer run whose conversation definition does not match', async () => {
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    const mutable = service as unknown as Record<string, unknown>;
    mutable.getAgentMetadata = vi.fn().mockResolvedValue({ id: 'conversation-1', agentDefId: 'other-definition' });

    await expect(service.executeAgentRun({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      message: 'hello',
      requestId: 'request-1',
      turnId: 'turn-1',
    })).rejects.toThrow('agent conversation definition mismatch');
  });

  it('rejects attachment range reads when another conversation does not reference the blob', async () => {
    const readRange = vi.fn();
    const query = vi.fn().mockResolvedValue([{ found: 0 }]);
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    Object.assign(service as unknown as Record<string, unknown>, {
      agentInstanceRepository: {},
      agentMessageRepository: {},
      remoteScheduledTaskProjectionRepository: {},
      dataSource: { query },
      attachmentUploadStore: {
        getReference: vi.fn().mockResolvedValue(attachmentReference),
        hasCommittedScope: vi.fn().mockReturnValue(false),
        readRange,
      },
    });

    await expect(service.readAgentAttachmentChunk({
      conversationId: 'unrelated-conversation',
      reference: attachmentReference,
      offset: 0,
      maxBytes: 4,
    })).rejects.toThrow('attachment is not authorized for this conversation');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('conversation_attachment_references'),
      ['unrelated-conversation', attachmentReference.contentHash, attachmentReference.filename, attachmentReference.mimeType, attachmentReference.size],
    );
    expect(readRange).not.toHaveBeenCalled();
  });

  it('rejects attachment range reads when renderer metadata differs from the stored reference', async () => {
    const query = vi.fn();
    const readRange = vi.fn();
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    Object.assign(service as unknown as Record<string, unknown>, {
      agentInstanceRepository: {},
      agentMessageRepository: {},
      remoteScheduledTaskProjectionRepository: {},
      dataSource: { query },
      attachmentUploadStore: {
        getReference: vi.fn().mockResolvedValue(attachmentReference),
        hasCommittedScope: vi.fn(),
        readRange,
      },
    });

    await expect(service.readAgentAttachmentChunk({
      conversationId: 'conversation-1',
      reference: { ...attachmentReference, filename: 'substituted.png' },
      offset: 0,
      maxBytes: 4,
    })).rejects.toThrow('attachment blob does not match its event-scoped reference');

    expect(query).not.toHaveBeenCalled();
    expect(readRange).not.toHaveBeenCalled();
  });

  it('throws the exact typed Core run error for a missing model before accepting a run', async () => {
    const sendMessage = vi.fn();
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    const mutable = service as unknown as Record<string, unknown>;
    mutable.agentDefinitionService = { getAgentDef: vi.fn().mockResolvedValue({ id: 'definition-1' }) };
    mutable.externalAPIService = { getAIConfig: vi.fn().mockResolvedValue({ default: undefined }) };
    mutable.getAgentMetadata = vi.fn().mockResolvedValue({
      id: 'conversation-1',
      agentDefId: 'definition-1',
    });
    mutable.getDurableAgentRuntime = vi.fn().mockResolvedValue({ sendMessage });

    await expect(service.executeAgentRun({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      message: 'hello',
      requestId: 'request-1',
      turnId: 'turn-1',
    })).rejects.toMatchObject({
      name: 'AgentRunFailure',
      agentRunError: expect.objectContaining({
        code: 'PROVIDER_CONFIGURATION_MISSING',
        retryable: false,
        localizedParams: { settingField: 'model' },
        settingTarget: { kind: 'runtime', section: 'agent' },
      }),
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('awaits an ask-question answer turn and propagates its terminal failure to the UI', async () => {
    const terminalFailure = new Error('answer run failed');
    const executeLocalAgentMessage = vi.fn().mockRejectedValue(terminalFailure);
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    Object.assign(service as unknown as Record<string, unknown>, {
      executeLocalAgentMessage,
      getAgentMetadata: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        agentDefId: 'definition-1',
      }),
    });

    await expect(service.resolveAskQuestion('conversation-1', 'question-1', 'Approach A')).rejects.toBe(terminalFailure);
    expect(executeLocalAgentMessage).toHaveBeenCalledWith(
      {
        target: { kind: 'local' },
        provenance: {
          conversationId: 'conversation-1',
          definitionId: 'definition-1',
          requestId: 'ask-question:question-1:request',
          turnId: 'ask-question:question-1:turn',
        },
        message: 'Approach A',
      },
    );
  });

  it('publishes one reset invalidation for the atomic retry pair', async () => {
    const retryResult = {
      handle: {
        runId: 'run-retry',
        conversationId: 'conversation-1',
        turnId: 'replacement-turn',
        requestId: 'retry-request',
        state: 'accepted' as const,
      },
      tombstone: { kind: 'tombstone' },
      userEvent: { kind: 'message' },
    };
    const retryTurn = vi.fn().mockResolvedValue(retryResult);
    const publishConversationInvalidation = vi.fn().mockResolvedValue(undefined);
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    Object.assign(service as unknown as Record<string, unknown>, {
      agentInstanceRepository: {},
      agentMessageRepository: {},
      remoteScheduledTaskProjectionRepository: {},
      conversationSubjects: new Map([['conversation-1', {}]]),
      deviceNetworkService: { getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }) },
      getConversationState: vi.fn().mockResolvedValue({ revision: '4', totalMessages: 2 }),
      getDurableAgentRuntime: vi.fn().mockResolvedValue({ retryTurn }),
      publishConversationInvalidation,
    });

    await expect(service.retryConversationTurn({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      newTurnId: 'replacement-turn',
      requestId: 'retry-request',
      turnId: 'source-turn',
    })).resolves.toEqual({ ok: true, ...retryResult.handle, tombstone: retryResult.tombstone, userEvent: retryResult.userEvent });
    expect(publishConversationInvalidation).toHaveBeenCalledWith(
      'conversation-1',
      { revision: '4', totalMessages: 2 },
      'reset',
    );
  });

  it('executes background work through a stable durable payload without volatile timestamps', async () => {
    const sent: unknown[] = [];
    const sendMessage = vi.fn(async input => {
      sent.push(structuredClone(input));
      return {
        runId: 'run-1',
        conversationId: 'conversation-1',
        turnId: 'scheduled:turn',
        requestId: 'scheduled:request',
        state: 'accepted',
      };
    });
    const getRunStatus = vi.fn().mockResolvedValue({
      runId: 'run-1',
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      turnId: 'scheduled:turn',
      requestPeerId: 'peer-local',
      requestId: 'scheduled:request',
      payloadDigest: 'digest',
      state: 'completed',
      acceptedAt: 1,
      updatedAt: 2,
      finishedAt: 2,
    });
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    const mutable = service as unknown as Record<string, unknown>;
    mutable.deviceNetworkService = { getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'peer-local' }) };
    mutable.agentDefinitionService = { getAgentDef: vi.fn().mockResolvedValue({ id: 'definition-1' }) };
    mutable.workspaceService = { getWorkspacesAsList: vi.fn().mockResolvedValue([]) };
    mutable.getAgentMetadata = vi.fn().mockResolvedValue({ id: 'conversation-1', agentDefId: 'definition-1', volatile: false });
    mutable.getAgentMessage = vi.fn().mockResolvedValue(undefined);
    mutable.getDurableAgentRuntime = vi.fn().mockResolvedValue({
      sendMessage,
      getRunStatus,
      subscribeToUpdates: vi.fn(() => vi.fn()),
    });
    mutable.updateAgentStatusBestEffort = vi.fn().mockResolvedValue(undefined);
    mutable.activeDurableRunIds = new Map();

    const request = {
      target: { kind: 'local' as const },
      provenance: {
        conversationId: 'conversation-1',
        definitionId: 'definition-1',
        requestId: 'scheduled:request',
        turnId: 'scheduled:turn',
      },
      message: 'wake',
    };
    await service.executeLocalAgentMessage(request);
    await service.executeLocalAgentMessage(request);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
    expect(sent[0]).toEqual(expect.objectContaining({
      requestId: 'scheduled:request',
      turnId: 'scheduled:turn',
      userMessage: expect.not.objectContaining({ timestamp: expect.anything() }),
    }));
  });
});
