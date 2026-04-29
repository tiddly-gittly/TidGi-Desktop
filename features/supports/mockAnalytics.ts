import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

export interface AnalyticsTrackPayload {
  site_id: string;
  type: 'custom_event';
  event_name: string;
  properties?: Record<string, unknown>;
  hostname: string;
  pathname: string;
}

export class MockAnalyticsServer {
  private server: Server | null = null;
  public port = 0;
  public baseUrl = '';
  private events: AnalyticsTrackPayload[] = [];

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((request: IncomingMessage, response: ServerResponse) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (request.method === 'OPTIONS') {
          response.writeHead(200);
          response.end();
          return;
        }

        try {
          const url = new URL(request.url || '', `http://127.0.0.1:${this.port}`);

          if (request.method === 'GET' && url.pathname === '/health') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ status: 'ok' }));
            return;
          }

          if (request.method === 'POST' && (url.pathname === '/api/track' || url.pathname === '/track')) {
            void this.handleTrack(request, response);
            return;
          }

          if (request.method === 'GET' && url.pathname === '/events') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ events: this.events }));
            return;
          }

          if (request.method === 'POST' && url.pathname === '/reset') {
            this.events = [];
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ success: true }));
            return;
          }

          response.writeHead(404, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Not found' }));
        } catch {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Bad request' }));
        }
      });

      this.server.on('error', (error) => {
        reject(new Error(String(error)));
      });

      this.server.on('listening', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });

      try {
        this.server.listen(0, '127.0.0.1');
      } catch (error) {
        reject(new Error(String(error)));
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.closeAllConnections?.();
      this.server!.close(() => {
        this.server = null;
        resolve();
      });
      setTimeout(() => {
        if (this.server) {
          this.server = null;
          resolve();
        }
      }, 1000);
    });
  }

  public getEvents(): AnalyticsTrackPayload[] {
    return [...this.events];
  }

  public getEventsByName(eventName: string): AnalyticsTrackPayload[] {
    return this.events.filter(event => event.event_name === eventName);
  }

  public clearEvents(): void {
    this.events = [];
  }

  public hasEvent(eventName: string): boolean {
    return this.events.some(event => event.event_name === eventName);
  }

  private async handleTrack(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      try {
        const payload = JSON.parse(body) as AnalyticsTrackPayload;
        this.events.push(payload);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: true }));
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }
}
