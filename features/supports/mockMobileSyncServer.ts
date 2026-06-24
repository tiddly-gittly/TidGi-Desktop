import { exec as gitExec } from 'dugite';
import fs from 'fs-extra';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

interface ICloneRequest {
  httpUrl: string;
  targetPath: string;
  workingDirectory: string;
}

interface ISyncRequest {
  clonePath: string;
  httpUrl: string;
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mock mobile sync request failed (${response.status}): ${text}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Test-only mobile peer. It runs in a separate Node HTTP server so E2E steps
 * exercise desktop sync through the same network boundary as a mobile client.
 */
export class MockMobileSyncServer {
  private server: Server | undefined;
  public baseUrl = '';
  public port = 0;

  public async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(0, '127.0.0.1', () => {
        const address = this.server!.address() as AddressInfo;
        this.port = address.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        resolve();
      });
      this.server!.closeAllConnections?.();
    });
    this.server = undefined;
    this.baseUrl = '';
    this.port = 0;
  }

  public async cloneWorkspace(request: ICloneRequest): Promise<void> {
    await postJson(`${this.baseUrl}/clone`, request);
  }

  public async syncWorkspace(request: ISyncRequest): Promise<void> {
    await postJson(`${this.baseUrl}/sync`, request);
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', this.baseUrl || 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/clone') {
        await this.handleClone(await readJsonBody<ICloneRequest>(request));
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/sync') {
        await this.handleSync(await readJsonBody<ISyncRequest>(request));
        sendJson(response, 200, { ok: true });
        return;
      }
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async handleClone({ httpUrl, targetPath, workingDirectory }: ICloneRequest): Promise<void> {
    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
    }
    const cloneResult = await gitExec(
      ['-c', 'http.proxy=', '-c', 'http.extraHeader=X-Requested-With: TiddlyWiki', 'clone', '--verbose', httpUrl, targetPath],
      workingDirectory,
    );
    if (cloneResult.exitCode !== 0) {
      throw new Error(`HTTP clone failed (url=${httpUrl}): ${cloneResult.stderr}`);
    }
  }

  private async handleSync({ clonePath, httpUrl }: ISyncRequest): Promise<void> {
    await gitExec(['config', 'user.name', 'MobileUser'], clonePath);
    await gitExec(['config', 'user.email', 'mobile@example.com'], clonePath);
    await gitExec(['remote', 'set-url', 'origin', httpUrl], clonePath);

    const commitResult = await gitExec(['add', '.'], clonePath)
      .then(() => gitExec(['commit', '-m', 'Mobile sync commit'], clonePath));
    if (commitResult.exitCode !== 0) {
      throw new Error(`Mobile commit failed: ${commitResult.stderr}`);
    }

    const pushResult = await gitExec(
      ['-c', 'http.proxy=', '-c', 'http.extraHeader=X-Requested-With: TiddlyWiki', 'push', '--force', 'origin', 'main:refs/heads/mobile-incoming'],
      clonePath,
    );
    if (pushResult.exitCode !== 0) {
      throw new Error(`HTTP push to mobile-incoming failed (url=${httpUrl}): ${pushResult.stderr}`);
    }

    const mergeResponse = await fetch(`${httpUrl}/merge-incoming`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'TiddlyWiki' },
    });
    if (!mergeResponse.ok) {
      throw new Error(`merge-incoming returned ${mergeResponse.status}: ${await mergeResponse.text()}`);
    }

    const fetchResult = await gitExec(
      ['-c', 'http.proxy=', '-c', 'http.extraHeader=X-Requested-With: TiddlyWiki', 'fetch', 'origin', 'main'],
      clonePath,
    );
    if (fetchResult.exitCode !== 0) {
      throw new Error(`HTTP fetch main failed (url=${httpUrl}): ${fetchResult.stderr}`);
    }
    const resetResult = await gitExec(['reset', '--hard', 'origin/main'], clonePath);
    if (resetResult.exitCode !== 0) {
      throw new Error(`Reset to origin/main failed: ${resetResult.stderr}`);
    }
  }
}
