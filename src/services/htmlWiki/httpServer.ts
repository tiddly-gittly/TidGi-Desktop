import http from 'node:http';

import { getDefaultHTTPServerIP } from '@/constants/urls';
import { logger } from '@services/libs/log';
import type { IHtmlWikiWorkspace } from '@services/workspaces/interface';

import type { IHtmlWikiService } from './interface';

interface IRunningHttpServer {
  server: http.Server;
  port: number;
}

export class HtmlWikiHttpServerManager {
  private readonly servers = new Map<string, IRunningHttpServer>();

  public async start(workspace: IHtmlWikiWorkspace, htmlWikiService: IHtmlWikiService): Promise<void> {
    if (!workspace.enableHTTPAPI) {
      return;
    }
    await this.stop(workspace.id);
    const port = workspace.port;
    const host = getDefaultHTTPServerIP(port);
    const server = http.createServer((request, response) => {
      void (async () => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) {
            if (typeof chunk === 'string') {
              chunks.push(Buffer.from(chunk));
            } else if (Buffer.isBuffer(chunk)) {
              chunks.push(chunk);
            }
          }
          const body = Buffer.concat(chunks).toString('utf-8');
          const result = await htmlWikiService.handleHttpRequest(workspace.id, request.method ?? 'GET', body);
          response.writeHead(result.statusCode, result.headers);
          response.end(result.body);
        } catch (error) {
          logger.error('HtmlWiki HTTP server request failed', { workspaceId: workspace.id, error });
          response.writeHead(500, { 'Content-Type': 'text/plain' });
          response.end((error as Error).message);
        }
      })();
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        resolve();
      });
    });
    this.servers.set(workspace.id, { server, port });
    logger.info('[test-id-HTML_WIKI_HTTP_STARTED] HTML wiki HTTP server started', { workspaceId: workspace.id, port, host });
  }

  public async stop(workspaceID: string): Promise<void> {
    const running = this.servers.get(workspaceID);
    if (!running) return;
    await new Promise<void>((resolve) => {
      running.server.close(() => {
        resolve();
      });
    });
    this.servers.delete(workspaceID);
  }
}
