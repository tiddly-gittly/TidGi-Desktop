import type { GitHTTPResponseChunk, IGitServerService } from '@services/gitServer/interface';
import http from 'node:http';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock inversify container to provide test doubles
const mockGitServerService: IGitServerService = {
  getWorkspaceRepoPath: vi.fn(),
  gitSmartHTTPInfoRefs$: vi.fn(),
  gitSmartHTTPUploadPack$: vi.fn(),
  gitSmartHTTPReceivePack$: vi.fn(),
  mergeAfterPush: vi.fn(),
  generateFullArchive: vi.fn(),
};

vi.mock('@services/container', () => ({
  container: {
    get: vi.fn(() => mockGitServerService),
  },
}));

vi.mock('@services/libs/log', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Store the git handler created during startServer
let capturedGitHandler: ((req: http.IncomingMessage, res: http.ServerResponse, wikiId: string, pathSuffix: string, queryString?: string) => Promise<void>) | null = null;

vi.mock('memeloop-node', () => ({
  startNodeServerWithMdns: vi.fn(async (options: any) => {
    // Capture the gitProxy handler passed to startNodeServerWithMdns
    capturedGitHandler = typeof options.gitProxy === 'function' ? options.gitProxy : null;
    // Return a minimal server mock
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server;
  }),
}));

// Import after mocks are set up
import { MemeloopNode } from '../index';

function makeChunks(...chunks: GitHTTPResponseChunk[]): Observable<GitHTTPResponseChunk> {
  return new Observable((subscriber) => {
    for (const chunk of chunks) {
      subscriber.next(chunk);
    }
    subscriber.complete();
  });
}

/**
 * Helper: simulate an HTTP request to the git handler by creating a mock IncomingMessage and ServerResponse.
 */
function simulateRequest(
  handler: NonNullable<typeof capturedGitHandler>,
  wikiId: string,
  pathSuffix: string,
  options?: { method?: string; body?: Buffer; queryString?: string },
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const { method = 'GET', body, queryString } = options ?? {};

    // Create a minimal mock IncomingMessage
    const req = Object.assign(new (require('node:stream').PassThrough)(), {
      method,
      url: `/git/${wikiId}/${pathSuffix}${queryString ? `?${queryString}` : ''}`,
      headers: {},
    }) as unknown as http.IncomingMessage;

    // If body provided, pipe it
    if (body) {
      (req as any).push(body);
      (req as any).push(null);
    } else {
      (req as any).push(null);
    }

    // Create a mock ServerResponse
    let statusCode = 200;
    let headersWritten: Record<string, string | string[] | undefined> = {};
    const bodyChunks: Buffer[] = [];

    const res = {
      writeHead(code: number, headers?: Record<string, string | string[] | undefined>) {
        statusCode = code;
        if (headers) headersWritten = { ...headersWritten, ...headers };
      },
      write(chunk: Buffer | string) {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
      end(chunk?: Buffer | string) {
        if (chunk) {
          bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        resolve({
          statusCode,
          headers: headersWritten,
          body: Buffer.concat(bodyChunks).toString(),
        });
      },
      headersSent: false,
    } as unknown as http.ServerResponse;

    handler(req, res, wikiId, pathSuffix, queryString).catch(reject);
  });
}

describe('MemeloopNode git handler', () => {
  let service: MemeloopNode;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedGitHandler = null;
    service = new (MemeloopNode as any)({
      get: vi.fn().mockResolvedValue(5200),
    });
    await service.startServer(0);
    expect(capturedGitHandler).toBeTruthy();
  });

  afterEach(async () => {
    await service.stopServer();
  });

  describe('discovery endpoint', () => {
    it('GET /git/mobile-sync-info returns available:true', async () => {
      const res = await simulateRequest(capturedGitHandler!, 'mobile-sync-info', '');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ available: true });
    });
  });

  describe('unregistered wiki', () => {
    it('returns 404 for unregistered wikiId', async () => {
      const res = await simulateRequest(capturedGitHandler!, 'unknown-wiki', 'info/refs', { queryString: 'service=git-upload-pack' });
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe('Wiki not found');
    });
  });

  describe('info/refs', () => {
    beforeEach(async () => {
      await service.registerWikiGitEndpoint('wiki1');
    });

    it('returns 400 for invalid service parameter', async () => {
      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'info/refs', { queryString: 'service=invalid' });
      expect(res.statusCode).toBe(400);
    });

    it('streams info/refs for git-upload-pack', async () => {
      vi.mocked(mockGitServerService.gitSmartHTTPInfoRefs$).mockReturnValue(
        makeChunks(
          { type: 'headers', statusCode: 200, headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' } },
          { type: 'data', data: new Uint8Array(Buffer.from('test-data')) },
        ),
      );

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'info/refs', { queryString: 'service=git-upload-pack' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('application/x-git-upload-pack-advertisement');
      expect(res.body).toBe('test-data');
      expect(mockGitServerService.gitSmartHTTPInfoRefs$).toHaveBeenCalledWith('wiki1', 'git-upload-pack');
    });

    it('streams info/refs for git-receive-pack', async () => {
      vi.mocked(mockGitServerService.gitSmartHTTPInfoRefs$).mockReturnValue(
        makeChunks(
          { type: 'headers', statusCode: 200, headers: { 'Content-Type': 'application/x-git-receive-pack-advertisement' } },
          { type: 'data', data: new Uint8Array(Buffer.from('receive-data')) },
        ),
      );

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'info/refs', { queryString: 'service=git-receive-pack' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('receive-data');
    });
  });

  describe('git-upload-pack', () => {
    beforeEach(async () => {
      await service.registerWikiGitEndpoint('wiki1');
    });

    it('POST /git/{wikiId}/git-upload-pack streams response', async () => {
      const requestBody = Buffer.from('upload-pack-request');
      vi.mocked(mockGitServerService.gitSmartHTTPUploadPack$).mockReturnValue(
        makeChunks(
          { type: 'headers', statusCode: 200, headers: { 'Content-Type': 'application/x-git-upload-pack-result' } },
          { type: 'data', data: new Uint8Array(Buffer.from('pack-data')) },
        ),
      );

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'git-upload-pack', {
        method: 'POST',
        body: requestBody,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('pack-data');
      expect(mockGitServerService.gitSmartHTTPUploadPack$).toHaveBeenCalledWith(
        'wiki1',
        expect.any(Uint8Array),
      );
    });
  });

  describe('git-receive-pack', () => {
    beforeEach(async () => {
      await service.registerWikiGitEndpoint('wiki1');
    });

    it('POST /git/{wikiId}/git-receive-pack streams response', async () => {
      vi.mocked(mockGitServerService.gitSmartHTTPReceivePack$).mockReturnValue(
        makeChunks(
          { type: 'headers', statusCode: 200, headers: { 'Content-Type': 'application/x-git-receive-pack-result' } },
          { type: 'data', data: new Uint8Array(Buffer.from('receive-result')) },
        ),
      );

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'git-receive-pack', {
        method: 'POST',
        body: Buffer.from('receive-request'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('receive-result');
    });
  });

  describe('full-archive', () => {
    beforeEach(async () => {
      await service.registerWikiGitEndpoint('wiki1');
    });

    it('returns 404 when archive not available', async () => {
      vi.mocked(mockGitServerService.generateFullArchive).mockResolvedValue(undefined);

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'full-archive');
      expect(res.statusCode).toBe(404);
    });
  });

  describe('merge-incoming', () => {
    beforeEach(async () => {
      await service.registerWikiGitEndpoint('wiki1');
    });

    it('POST /git/{wikiId}/merge-incoming calls mergeAfterPush', async () => {
      vi.mocked(mockGitServerService.mergeAfterPush).mockResolvedValue(undefined);

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'merge-incoming', { method: 'POST' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });
      expect(mockGitServerService.mergeAfterPush).toHaveBeenCalledWith('wiki1');
    });

    it('returns 500 when merge fails', async () => {
      vi.mocked(mockGitServerService.mergeAfterPush).mockRejectedValue(new Error('merge conflict'));

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'merge-incoming', { method: 'POST' });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('pack-size', () => {
    beforeEach(async () => {
      await service.registerWikiGitEndpoint('wiki1');
    });

    it('GET /git/{wikiId}/pack-size returns estimated size', async () => {
      vi.mocked(mockGitServerService.generateFullArchive).mockResolvedValue({
        archivePath: '/tmp/archive.tar',
        commitHash: 'abc123',
        sizeBytes: 1024,
      });

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'pack-size');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ estimatedBytes: 1024 });
    });

    it('returns empty object when archive generation fails', async () => {
      vi.mocked(mockGitServerService.generateFullArchive).mockRejectedValue(new Error('failed'));

      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'pack-size');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({});
    });
  });

  describe('unknown endpoint', () => {
    beforeEach(async () => {
      await service.registerWikiGitEndpoint('wiki1');
    });

    it('returns 404 for unknown path suffix', async () => {
      const res = await simulateRequest(capturedGitHandler!, 'wiki1', 'unknown-path');
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe('Unknown git endpoint');
    });
  });

  describe('wiki registration', () => {
    it('registerWikiGitEndpoint makes wiki available', async () => {
      // Before registration - should 404
      let res = await simulateRequest(capturedGitHandler!, 'wiki2', 'info/refs', { queryString: 'service=git-upload-pack' });
      expect(res.statusCode).toBe(404);

      // Register
      await service.registerWikiGitEndpoint('wiki2');

      // After registration - should reach gitService
      vi.mocked(mockGitServerService.gitSmartHTTPInfoRefs$).mockReturnValue(
        makeChunks(
          { type: 'headers', statusCode: 200, headers: {} },
        ),
      );
      res = await simulateRequest(capturedGitHandler!, 'wiki2', 'info/refs', { queryString: 'service=git-upload-pack' });
      expect(res.statusCode).toBe(200);
    });

    it('unregisterWikiGitEndpoint removes wiki availability', async () => {
      await service.registerWikiGitEndpoint('wiki3');
      await service.unregisterWikiGitEndpoint('wiki3');

      const res = await simulateRequest(capturedGitHandler!, 'wiki3', 'info/refs', { queryString: 'service=git-upload-pack' });
      expect(res.statusCode).toBe(404);
    });

    it('getRegisteredWikis returns all registered wikiIds', async () => {
      await service.registerWikiGitEndpoint('a');
      await service.registerWikiGitEndpoint('b');
      const wikis = await service.getRegisteredWikis();
      expect(wikis).toContain('a');
      expect(wikis).toContain('b');
    });
  });

  describe('peer and remote wiki methods', () => {
    it('getConnectedPeers returns empty array (stub)', async () => {
      const peers = await service.getConnectedPeers();
      expect(peers).toEqual([]);
    });

    it('listRemoteWikis returns empty array (stub)', async () => {
      const wikis = await service.listRemoteWikis('some-node-id');
      expect(wikis).toEqual([]);
    });

    it('listAllRemoteWikis returns empty array when no peers', async () => {
      const wikis = await service.listAllRemoteWikis();
      expect(wikis).toEqual([]);
    });

    it('getSyncStatus returns default when worker not available', async () => {
      const status = await service.getSyncStatus();
      expect(status).toEqual({ versionVector: {}, peerCount: 0, syncRunning: false });
    });
  });
});
