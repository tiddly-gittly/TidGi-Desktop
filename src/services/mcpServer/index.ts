import { logger } from '@services/libs/log';
import { mcpServerPortSchema } from '@services/preferences/definitions/preferenceSchemas';
import type { IPreferenceService } from '@services/preferences/interface';
import type http from 'node:http';

export const DEFAULT_MCP_SERVER_PORT = 38385;

let server: http.Server | undefined;

function getEffectiveMcpAuth(requireToken: boolean, token: string) {
  const normalizedToken = token.trim();
  const shouldRequireToken = requireToken && normalizedToken.length > 0;
  return {
    normalizedToken,
    shouldRequireToken,
  };
}

export async function startMcpServer(port: number = DEFAULT_MCP_SERVER_PORT, requireToken = false, token = ''): Promise<void> {
  if (server !== undefined) return;
  const portResult = mcpServerPortSchema.safeParse(port);
  if (!portResult.success) {
    logger.warn(`MCP server not started: invalid port ${port}`);
    return;
  }
  const listenPort = portResult.data;
  const { normalizedToken, shouldRequireToken } = getEffectiveMcpAuth(requireToken, token);
  if (requireToken && !shouldRequireToken) {
    logger.warn('MCP server token auth requested but mcpServerToken is empty; starting without token auth');
  }
  // Dynamic import to avoid loading @modelcontextprotocol/sdk at module init time
  // (static imports in server.ts → sdkAdapter.ts chain would hang Electron startup on CI)
  const { createMcpHttpServer } = await import('./server');
  const httpServer = createMcpHttpServer(shouldRequireToken ? { requireToken: true, token: normalizedToken } : undefined);
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (server === httpServer) {
      server = undefined;
    }
    if (error.code === 'EADDRINUSE') {
      logger.warn(`MCP server port ${listenPort} already in use, skipping`);
    } else {
      logger.error('MCP server error', { error });
    }
  });
  server = httpServer;
  httpServer.listen(listenPort, '127.0.0.1', () => {
    logger.info(`TidGi MCP server listening on http://127.0.0.1:${listenPort}/mcp`);
  });
}

export function stopMcpServer(): Promise<void> | undefined {
  return new Promise((resolve) => {
    if (server === undefined) {
      resolve();
      return;
    }
    server.close(() => {
      server = undefined;
      resolve();
    });
  });
}

export function __resetMcpServerForTests(): void {
  server = undefined;
}

let startPromise: Promise<void> | undefined;

/**
 * Initialize MCP server from preferences and watch for changes.
 */
export async function initializeMcpServer(preferenceService: IPreferenceService): Promise<void> {
  await restartMcpServerIfNeeded(preferenceService);
  // Watch for preference changes
  const previousMcpPrefs: { enabled?: boolean; port?: number; requireToken?: boolean; token?: string } = {};
  preferenceService.preference$.subscribe(async (prefs) => {
    if (!prefs) return;
    const { mcpServerEnabled, mcpServerPort, mcpServerRequireToken, mcpServerToken } = prefs;
    if (
      mcpServerEnabled !== previousMcpPrefs.enabled || mcpServerPort !== previousMcpPrefs.port ||
      mcpServerRequireToken !== previousMcpPrefs.requireToken || mcpServerToken !== previousMcpPrefs.token
    ) {
      Object.assign(previousMcpPrefs, { enabled: mcpServerEnabled, port: mcpServerPort, requireToken: mcpServerRequireToken, token: mcpServerToken });
      restartMcpServerIfNeeded(preferenceService).catch((error: unknown) => {
        logger.error('Failed to restart MCP server after preference change', { error });
      });
    }
  });
}

/**
 * Read MCP preferences and start or stop the server accordingly.
 */
export async function restartMcpServerIfNeeded(preferenceService: IPreferenceService): Promise<void> {
  if (startPromise) {
    await startPromise;
  }
  startPromise = (async () => {
    try {
      const enabled = await preferenceService.get('mcpServerEnabled');
      if (!enabled) {
        await stopMcpServer();
        return;
      }
      await stopMcpServer();
      const port = await preferenceService.get('mcpServerPort');
      const requireToken = await preferenceService.get('mcpServerRequireToken');
      const token = await preferenceService.get('mcpServerToken');
      await startMcpServer(port, requireToken, token);
    } finally {
      startPromise = undefined;
    }
  })();
  await startPromise;
  startPromise = undefined;
}
