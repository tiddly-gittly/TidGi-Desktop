import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeMcpServer: vi.fn(),
}));

vi.mock('@services/mcpServer', () => ({
  initializeMcpServer: mocks.initializeMcpServer,
}));

import { initializeWorkspaceStartupServices } from '../workspaceStartup';

describe('initializeWorkspaceStartupServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initializeMcpServer.mockResolvedValue(undefined);
  });

  it('starts MCP before device networking', async () => {
    const events: string[] = [];
    mocks.initializeMcpServer.mockImplementation(async () => {
      events.push('mcp');
    });
    const deviceNetworkService = {
      start: vi.fn(async () => {
        events.push('device-network');
      }),
    } as unknown as IDeviceNetworkService;

    await initializeWorkspaceStartupServices({
      assertStartupActive: () => events.push('assert-active'),
      deviceNetworkService,
      preferenceService: {} as IPreferenceService,
    });

    expect(events).toEqual(['mcp', 'assert-active', 'device-network', 'assert-active']);
  });

  it('contains a device-network failure so workspace startup can continue', async () => {
    const deviceNetworkService = {
      start: vi.fn().mockRejectedValue(new Error('network unavailable')),
    } as unknown as IDeviceNetworkService;

    await expect(initializeWorkspaceStartupServices({
      assertStartupActive: vi.fn(),
      deviceNetworkService,
      preferenceService: {} as IPreferenceService,
    })).resolves.toBeUndefined();
  });
});
