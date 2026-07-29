import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';

export interface IProxyRequest {
  method: string;
  url: string;
}

function packetLine(payload: string): string {
  return (Buffer.byteLength(payload) + 4).toString(16).padStart(4, '0') + payload;
}

function gitAdvertisement(): string {
  const objectId = '1111111111111111111111111111111111111111';
  return packetLine('# service=git-upload-pack\n') +
    '0000' +
    packetLine(`${objectId} HEAD\0symref=HEAD:refs/heads/main agent=tidgi-proxy-e2e\n`) +
    packetLine(`${objectId} refs/heads/main\n`) +
    '0000';
}

/**
 * An HTTP proxy that deliberately never forwards. It records the absolute-form
 * target URL and returns deterministic responses, so a passing test proves the
 * request reached this process instead of the public network.
 */
export class MockProxyServer {
  private server: Server | undefined;
  public baseUrl = '';
  public requests: IProxyRequest[] = [];

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((request: IncomingMessage, response: ServerResponse) => {
        const targetUrl = request.url ?? '';
        this.requests.push({ method: request.method ?? 'GET', url: targetUrl });

        if (targetUrl.includes('/info/refs?service=git-upload-pack')) {
          response.writeHead(200, {
            'Content-Type': 'application/x-git-upload-pack-advertisement',
            'Cache-Control': 'no-cache',
          });
          response.end(gitAdvertisement());
          return;
        }

        response.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        response.end(`mock-proxy:${targetUrl}`);
      });
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address() as AddressInfo;
        this.baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    server.closeAllConnections?.();
    await new Promise<void>(resolve => {
      server.close(() => {
        resolve();
      });
    });
  }
}
