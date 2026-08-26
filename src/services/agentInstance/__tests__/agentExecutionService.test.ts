import { describe, expect, it, vi } from 'vitest';

import { AgentInstanceService } from '../index';

describe('AgentInstanceService durable execution IPC', () => {
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

  it('rejects a missing model selection with one stable IPC-safe code before accepting a run', async () => {
    const sendMessage = vi.fn();
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    const mutable = service as unknown as Record<string, unknown>;
    mutable.agentDefinitionService = { getAgentDef: vi.fn().mockResolvedValue({ id: 'definition-1' }) };
    mutable.externalAPIService = { getAIConfig: vi.fn().mockResolvedValue({ default: undefined }) };
    mutable.getAgentMetadata = vi.fn().mockResolvedValue({ id: 'conversation-1', agentDefId: 'definition-1' });
    mutable.getDurableAgentRuntime = vi.fn().mockResolvedValue({ sendMessage });

    await expect(service.executeAgentRun({
      conversationId: 'conversation-1',
      definitionId: 'definition-1',
      message: 'hello',
      requestId: 'request-1',
      turnId: 'turn-1',
    })).rejects.toEqual(expect.objectContaining({
      code: 'MODEL_SELECTION_NOT_CONFIGURED',
      name: 'DesktopAgentExecutionPortError',
    }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('awaits an ask-question answer turn and propagates its terminal failure to the UI', async () => {
    const terminalFailure = new Error('answer run failed');
    const executeLocalAgentMessage = vi.fn().mockRejectedValue(terminalFailure);
    const service = Object.create(AgentInstanceService.prototype) as AgentInstanceService;
    Object.assign(service as unknown as Record<string, unknown>, { executeLocalAgentMessage });

    await expect(service.resolveAskQuestion('conversation-1', 'question-1', 'Approach A')).rejects.toBe(terminalFailure);
    expect(executeLocalAgentMessage).toHaveBeenCalledWith(
      'conversation-1',
      { text: 'Approach A' },
      {
        source: 'ask-question',
        requestId: 'ask-question:question-1:request',
        turnId: 'ask-question:question-1:turn',
        provenance: { questionId: 'question-1' },
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
    mutable.getDurableAgentRuntime = vi.fn().mockResolvedValue({
      sendMessage,
      getRunStatus,
      subscribeToUpdates: vi.fn(() => vi.fn()),
    });
    mutable.updateAgentStatusBestEffort = vi.fn().mockResolvedValue(undefined);
    mutable.activeDurableRunIds = new Map();

    const input = {
      source: 'scheduled-task' as const,
      requestId: 'scheduled:request',
      turnId: 'scheduled:turn',
    };
    await service.executeLocalAgentMessage('conversation-1', { text: 'wake' }, input);
    await service.executeLocalAgentMessage('conversation-1', { text: 'wake' }, input);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
    expect(sent[0]).toEqual(expect.objectContaining({
      requestId: 'scheduled:request',
      turnId: 'scheduled:turn',
      userMessage: expect.not.objectContaining({ timestamp: expect.anything() }),
    }));
  });
});
