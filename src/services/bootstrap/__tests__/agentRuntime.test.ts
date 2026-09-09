import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { describe, expect, it, vi } from 'vitest';
import { initializeAgentServicesSafelyWithServices } from '../agentRuntime';
import { REMOTE_AGENT_MESSAGE_MAX_BYTES } from '../remoteAgentRpcPolicy';

function createOptions() {
  const durableRuntime = {
    createAgent: vi.fn().mockResolvedValue({ conversationId: 'conversation-1' }),
    sendMessage: vi.fn().mockResolvedValue({ runId: 'run-1', conversationId: 'conversation-1' }),
    getRunStatus: vi.fn().mockResolvedValue(undefined),
    cancelRun: vi.fn().mockResolvedValue(false),
    retryTurn: vi.fn().mockResolvedValue({ runId: 'retry-run-1', conversationId: 'conversation-1' }),
  };
  return {
    durableRuntime,
    agentDefinitionService: {
      initialize: vi.fn().mockResolvedValue(undefined),
      getAgentDefs: vi.fn().mockResolvedValue([]),
    } as unknown as IAgentDefinitionService,
    agentInstanceService: {
      initialize: vi.fn().mockResolvedValue(undefined),
      sendMsgToAgent: vi.fn().mockResolvedValue(undefined),
      ensureAgentConversation: vi.fn().mockImplementation(async (_definitionId: string, conversationId?: string) => ({
        conversationId: conversationId ?? 'conversation-1',
      })),
      getDurableAgentRuntime: vi.fn().mockResolvedValue(durableRuntime),
    } as unknown as IAgentInstanceService,
    deviceNetworkService: {
      getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'test-peer' }),
      configureRuntime: vi.fn(),
    } as unknown as IDeviceNetworkService,
    wikiService: {} as IWikiService,
    workspaceService: {
      getWorkspacesAsList: vi.fn().mockResolvedValue([]),
    } as unknown as IWorkspaceService,
  };
}

describe('initializeAgentServicesSafely', () => {
  it('keeps app startup available when a damaged Meme Loop database cannot synchronize', async () => {
    const options = createOptions();
    vi.mocked(options.agentDefinitionService.initialize).mockRejectedValue(
      new Error('NOT NULL constraint failed: temporary_agent_instance_messages.messageId'),
    );

    await expect(initializeAgentServicesSafelyWithServices(options)).resolves.toBe(false);
    expect(options.agentInstanceService.initialize).not.toHaveBeenCalled();
    expect(options.deviceNetworkService.configureRuntime).not.toHaveBeenCalled();
  });

  it('configures the runtime after successful Agent initialization', async () => {
    const options = createOptions();

    await expect(initializeAgentServicesSafelyWithServices(options)).resolves.toBe(true);
    expect(options.agentDefinitionService.initialize).toHaveBeenCalledOnce();
    expect(options.agentInstanceService.initialize).toHaveBeenCalledOnce();
    expect(options.agentInstanceService.getDurableAgentRuntime).toHaveBeenCalledOnce();
    expect(options.deviceNetworkService.configureRuntime).toHaveBeenCalledOnce();
  });

  it('installs the inbound Agent RPC resource policy on the production handler', async () => {
    const options = createOptions();
    await expect(initializeAgentServicesSafelyWithServices(options)).resolves.toBe(true);
    const [runtimeOptions] = vi.mocked(options.deviceNetworkService.configureRuntime).mock.calls[0];

    await expect(
      runtimeOptions.rpcHandler?.({
        remotePeerId: 'remote-peer',
        method: 'memeloop.agent.send',
        parameters: {
          conversationId: 'conversation-1',
          message: 'x'.repeat(REMOTE_AGENT_MESSAGE_MAX_BYTES + 1),
        },
      }),
    ).rejects.toThrow(`remote_agent_message_too_large:${REMOTE_AGENT_MESSAGE_MAX_BYTES}`);
    expect(options.durableRuntime.sendMessage).not.toHaveBeenCalled();
  });
});
