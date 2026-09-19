import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import { logger } from '@services/libs/log';
import { initializeMcpServer } from '@services/mcpServer';
import type { IPreferenceService } from '@services/preferences/interface';

/**
 * Start services that must remain available even when a saved wiki is slow or
 * offline. Call this after observables are initialized and before the isolated
 * workspace-view batch, so a future workspace startup change cannot delay MCP
 * or device networking again.
 */
export async function initializeWorkspaceStartupServices(options: {
  assertStartupActive: () => void;
  deviceNetworkService: IDeviceNetworkService;
  preferenceService: IPreferenceService;
}): Promise<void> {
  const { assertStartupActive, deviceNetworkService, preferenceService } = options;

  await initializeMcpServer(preferenceService);
  assertStartupActive();

  try {
    await deviceNetworkService.start();
  } catch (error) {
    logger.error('Failed to start DeviceNetworkService', { error });
  }
  assertStartupActive();
}
