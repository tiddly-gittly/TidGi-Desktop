import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import type http from 'node:http';

export const DEFAULT_MCP_SERVER_PORT = 38385;

let server: http.Server | undefined;

export async function startMcpServer(port: number = DEFAULT_MCP_SERVER_PORT, requireToken = false, token = ''): Promise<void> {
  if (server !== undefined) return;
  // Dynamic import to avoid loading @modelcontextprotocol/sdk at module init time
  // (static imports in server.ts → sdkAdapter.ts chain would hang Electron startup on CI)
  const { createMcpHttpServer } = await import('./server');
  server = createMcpHttpServer(requireToken && token ? { requireToken: true, token } : undefined);
  server.listen(port, '127.0.0.1', () => {
    logger.info(`TidGi MCP server listening on http://127.0.0.1:${port}/mcp`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.warn(`MCP server port ${port} already in use, skipping`);
    } else {
      logger.error('MCP server error', { error });
    }
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

let startPromise: Promise<void> | undefined;

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
