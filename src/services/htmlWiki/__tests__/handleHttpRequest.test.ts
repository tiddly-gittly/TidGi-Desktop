import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HtmlWiki } from '../index';

const mockGet = vi.fn();
const mockNotifyFileChange = vi.fn();

vi.mock('@services/container', () => ({
  container: {
    get: vi.fn((identifier: symbol) => {
      const id = identifier.toString();
      if (id.includes('Workspace')) {
        return { get: mockGet };
      }
      if (id.includes('Git')) {
        return { notifyFileChange: mockNotifyFileChange };
      }
      if (id.includes('Sync')) {
        return { startIntervalSyncIfNeeded: vi.fn(), stopIntervalSync: vi.fn() };
      }
      if (id.includes('Window')) {
        return { get: vi.fn() };
      }
      if (id.includes('WorkspaceView')) {
        return { removeWorkspaceView: vi.fn() };
      }
      return {};
    }),
  },
}));

vi.mock('@services/serviceIdentifier', () => ({
  default: {
    Workspace: Symbol.for('Workspace'),
    Git: Symbol.for('Git'),
    Sync: Symbol.for('Sync'),
    Window: Symbol.for('Window'),
    WorkspaceView: Symbol.for('WorkspaceView'),
  },
}));

describe('HtmlWiki handleHttpRequest', () => {
  let tempDir: string;
  let htmlPath: string;
  const service = new HtmlWiki();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-html-http-'));
    htmlPath = path.join(tempDir, 'wiki.html');
    await fs.writeFile(htmlPath, '<html><body>original</body></html>', 'utf-8');
    mockGet.mockResolvedValue({
      id: 'ws-html',
      workspaceType: 'html',
      htmlFileLocation: htmlPath,
      name: 'HTML Wiki',
      port: 5212,
      wikiFolderLocation: tempDir,
      readOnlyMode: false,
      tokenAuth: false,
    });
    mockNotifyFileChange.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('GET returns html content', async () => {
    const response = await service.handleHttpRequest('ws-html', { method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('original');
    expect(response.headers['X-TidGi-HTML-Revision']).toBeDefined();
    expect(response.headers.ETag).toBeDefined();
  });

  it('HEAD returns revision headers without body', async () => {
    const response = await service.handleHttpRequest('ws-html', { method: 'HEAD', url: '/tidgi-html-sync/file' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
    expect(response.headers['X-TidGi-HTML-Revision']).toBeDefined();
  });

  it('status returns html sync health information', async () => {
    const response = await service.handleHttpRequest('ws-html', { method: 'GET', url: '/status' });
    expect(response.statusCode).toBe(200);
    expect(typeof response.body).toBe('string');
    expect(JSON.parse(response.body as string)).toMatchObject({
      ok: true,
      read_only: false,
      syncType: 'html',
      workspaceId: 'ws-html',
    });
  });

  it('sync info returns mobile html sync metadata', async () => {
    const response = await service.handleHttpRequest('ws-html', {
      headers: { host: '192.168.1.20:5212' },
      method: 'GET',
      url: '/tidgi-html-sync/info',
    });
    expect(response.statusCode).toBe(200);
    expect(typeof response.body).toBe('string');
    expect(JSON.parse(response.body as string)).toMatchObject({
      baseUrl: 'http://192.168.1.20:5212',
      htmlUrl: 'http://192.168.1.20:5212/tidgi-html-sync/file',
      readOnly: false,
      syncType: 'html',
      workspaceId: 'ws-html',
      workspaceName: 'HTML Wiki',
    });
  });

  it('PUT writes html back to the same file', async () => {
    const response = await service.handleHttpRequest('ws-html', { body: '<html><body>saved</body></html>', method: 'PUT', url: '/tidgi-html-sync/file' });
    expect(response.statusCode).toBe(204);
    expect(response.headers['X-TidGi-HTML-Revision']).toBeDefined();
    const content = await fs.readFile(htmlPath, 'utf-8');
    expect(content).toContain('saved');
    expect(mockNotifyFileChange).toHaveBeenCalledWith(tempDir, { onlyWhenGitLogOpened: true });
  });

  it('PUT rejects in read-only mode', async () => {
    mockGet.mockResolvedValue({
      id: 'ws-html',
      workspaceType: 'html',
      htmlFileLocation: htmlPath,
      name: 'HTML Wiki',
      port: 5212,
      wikiFolderLocation: tempDir,
      readOnlyMode: true,
      tokenAuth: false,
    });
    const response = await service.handleHttpRequest('ws-html', { body: '<html></html>', method: 'PUT', url: '/tidgi-html-sync/file' });
    expect(response.statusCode).toBe(403);
  });

  it('requires token auth for html sync endpoints when enabled', async () => {
    mockGet.mockResolvedValue({
      authToken: 'secret-token',
      htmlFileLocation: htmlPath,
      id: 'ws-html',
      name: 'HTML Wiki',
      port: 5212,
      readOnlyMode: false,
      tokenAuth: true,
      userName: 'TidGi User',
      wikiFolderLocation: tempDir,
      workspaceType: 'html',
    });
    const rejected = await service.handleHttpRequest('ws-html', { method: 'GET', url: '/tidgi-html-sync/info' });
    expect(rejected.statusCode).toBe(403);

    const accepted = await service.handleHttpRequest('ws-html', {
      headers: { 'x-tidgi-auth-token-secret-token': 'TidGi User' },
      method: 'GET',
      url: '/tidgi-html-sync/info',
    });
    expect(accepted.statusCode).toBe(200);
  });
});
