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
      wikiFolderLocation: tempDir,
      readOnlyMode: false,
    });
    mockNotifyFileChange.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('GET returns html content', async () => {
    const response = await service.handleHttpRequest('ws-html', 'GET');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('original');
  });

  it('PUT writes html back to the same file', async () => {
    const response = await service.handleHttpRequest('ws-html', 'PUT', '<html><body>saved</body></html>');
    expect(response.statusCode).toBe(204);
    const content = await fs.readFile(htmlPath, 'utf-8');
    expect(content).toContain('saved');
    expect(mockNotifyFileChange).toHaveBeenCalledWith(tempDir, { onlyWhenGitLogOpened: true });
  });

  it('PUT rejects in read-only mode', async () => {
    mockGet.mockResolvedValue({
      id: 'ws-html',
      workspaceType: 'html',
      htmlFileLocation: htmlPath,
      wikiFolderLocation: tempDir,
      readOnlyMode: true,
    });
    const response = await service.handleHttpRequest('ws-html', 'PUT', '<html></html>');
    expect(response.statusCode).toBe(403);
  });
});
