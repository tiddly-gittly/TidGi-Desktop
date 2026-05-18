import { logger } from '@services/libs/log';
import { createMcpHttpServer } from './server';

export const MCP_SERVER_PORT = 7890;

let server: ReturnType<typeof createMcpHttpServer> | undefined;

export function startMcpServer(): void {
  if (server !== undefined) return;
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
