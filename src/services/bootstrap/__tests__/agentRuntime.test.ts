import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { describe, expect, it, vi } from 'vitest';
import { initializeAgentServicesSafelyWithServices } from '../agentRuntime';

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
      getConversationMeta: vi.fn().mockResolvedValue({
        conversationId: 'conversation-1',
        originNodeId: 'test-peer',
        title: 'Main',
        definitionId: 'assistant',
        lastMessagePreview: '',
        lastMessageTimestamp: 1,
        messageCount: 0,
        originClock: 1,
        isUserInitiated: true,
      }),
    } as unknown as IAgentInstanceService,
    deviceNetworkService: {
      getLocalIdentity: vi.fn().mockResolvedValue({ peerId: 'test-peer' }),
      authorizeAgentRpc: vi.fn().mockImplementation(async ({ remotePeerId }: { remotePeerId: string }) => remotePeerId === 'remote-peer'),
      configureRuntime: vi.fn(),
    } as unknown as IDeviceNetworkService,
    wikiService: {} as IWikiService,
    workspaceService: {
      getWorkspacesAsList: vi.fn().mockResolvedValue([]),
    } as unknown as IWorkspaceService,
    preferenceService: {
      get: vi.fn().mockResolvedValue('conversation-1'),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPreferenceService,
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

  it('resolves the explicitly selected main conversation through the production handler', async () => {
    const options = createOptions();
    await expect(initializeAgentServicesSafelyWithServices(options)).resolves.toBe(true);
    const [runtimeOptions] = vi.mocked(options.deviceNetworkService.configureRuntime).mock.calls[0];

    await expect(
      runtimeOptions.rpcHandler?.({
        remotePeerId: 'remote-peer',
        method: 'memeloop.chat.getMainConversation',
        parameters: {},
        presentedGrant: {
          issuer: 'memeloop-cloud',
          accountId: 'account-1',
          subjectPeerId: 'remote-peer',
          allowedPeerIds: ['test-peer'],
          protocols: ['/memeloop/rpc/2.0.0'],
          rpcMethodScope: { mode: 'all' },
          conversationScope: { mode: 'all' },
          definitionScope: { mode: 'all' },
          issuedAt: 1,
          expiresAt: 1000,
          signature: 'verified-by-transport',
        },
      }),
    ).resolves.toMatchObject({ conversation: { conversationId: 'conversation-1' } });
    expect(options.preferenceService.get).toHaveBeenCalledWith('mainAgentConversationId');
  });

  it('allows paired main-history reads without a cloud grant and rejects a removed peer', async () => {
    const options = createOptions();
    await initializeAgentServicesSafelyWithServices(options);
    const [runtimeOptions] = vi.mocked(options.deviceNetworkService.configureRuntime).mock.calls[0];
    const request = {
      remotePeerId: 'remote-peer',
      method: 'memeloop.chat.getMainConversation',
      parameters: {},
    };
    await expect(runtimeOptions.rpcHandler?.(request)).resolves.toMatchObject({
      conversation: { conversationId: 'conversation-1' },
    });
    vi.mocked(options.deviceNetworkService.authorizeAgentRpc).mockResolvedValue(false);
    await expect(runtimeOptions.rpcHandler?.(request)).rejects.toThrow('rpc_permission_denied');
  });
});
