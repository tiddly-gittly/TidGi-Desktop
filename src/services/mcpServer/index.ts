import { logger } from '@services/libs/log';
import type http from 'node:http';

export const DEFAULT_MCP_SERVER_PORT = 7890;

let server: http.Server | undefined;

export async function startMcpServer(port: number = DEFAULT_MCP_SERVER_PORT): Promise<void> {
  if (server !== undefined) return;
  // Dynamic import to avoid loading @modelcontextprotocol/sdk at module init time
  // (static imports in server.ts → sdkAdapter.ts chain would hang Electron startup on CI)
  const { createMcpHttpServer } = await import('./server');
  server = createMcpHttpServer();
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

export function stopMcpServer(): void {
  server?.close();
  server = undefined;
}
