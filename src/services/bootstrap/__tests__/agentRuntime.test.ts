import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { describe, expect, it, vi } from 'vitest';
import { initializeAgentServicesSafely } from '../agentRuntime';

function createOptions() {
  return {
    agentDefinitionService: {
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAgentDefinitionService,
    agentInstanceService: {
      initialize: vi.fn().mockResolvedValue(undefined),
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
  it('keeps app startup available when a stale Agent database cannot synchronize', async () => {
    const options = createOptions();
    vi.mocked(options.agentDefinitionService.initialize).mockRejectedValue(
      new Error('NOT NULL constraint failed: temporary_agent_instance_messages.messageId'),
    );

    await expect(initializeAgentServicesSafely(options)).resolves.toBe(false);
    expect(options.agentInstanceService.initialize).not.toHaveBeenCalled();
    expect(options.deviceNetworkService.configureRuntime).not.toHaveBeenCalled();
  });

  it('configures the runtime after successful Agent initialization', async () => {
    const options = createOptions();

    await expect(initializeAgentServicesSafely(options)).resolves.toBe(true);
    expect(options.agentDefinitionService.initialize).toHaveBeenCalledOnce();
    expect(options.agentInstanceService.initialize).toHaveBeenCalledOnce();
    expect(options.deviceNetworkService.configureRuntime).toHaveBeenCalledOnce();
  });
});
