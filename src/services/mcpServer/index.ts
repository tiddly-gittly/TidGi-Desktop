import { logger } from '@services/libs/log';
import type http from 'node:http';

export const MCP_SERVER_PORT = 7890;

let server: http.Server | undefined;

export async function startMcpServer(): Promise<void> {
  if (server !== undefined) return;
  // Dynamic import to avoid loading @modelcontextprotocol/sdk at module init time
  // (static imports in server.ts → sdkAdapter.ts chain would hang Electron startup on CI)
  const { createMcpHttpServer } = await import('./server');
  server = createMcpHttpServer();
  server.listen(MCP_SERVER_PORT, '127.0.0.1', () => {
    logger.info(`TidGi MCP server listening on http://127.0.0.1:${MCP_SERVER_PORT}/mcp`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.warn(`MCP server port ${MCP_SERVER_PORT} already in use, skipping`);
    } else {
      logger.error('MCP server error', { error });
    }
  });
}

export function stopMcpServer(): void {
  server?.close();
  server = undefined;
}
