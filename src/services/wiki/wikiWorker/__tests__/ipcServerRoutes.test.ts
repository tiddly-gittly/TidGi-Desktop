import type { ITiddlyWiki } from 'tiddlywiki';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcServerRoutes } from '../ipcServerRoutes';

// Types and helpers
type WikiWithGetText = ITiddlyWiki & { wiki: { getTiddlerText: (title: string, def: string) => string } };
type TryReadFileFn = (
  wikiPath: string,
  externalAttachmentsFolder: string,
  suppliedFilename: string,
) => Promise<{ data: Buffer; type: string } | null>;

function createMockWikiInstance(opts?: {
  wikiPath?: string;
  externalFolder?: string;
  fileExtensionInfo?: Record<string, { type: string }>;
}): WikiWithGetText {
  const wikiPath = opts?.wikiPath ?? '/main/wiki';
  const externalFolder = opts?.externalFolder ?? 'files';
  const fileExtensionInfo = opts?.fileExtensionInfo ?? {
    '.png': { type: 'image/png' },
    '.jpg': { type: 'image/jpeg' },
  };
  return {
    version: '5.3.0',
    boot: { wikiPath },
    config: { fileExtensionInfo },
    wiki: {
      getTiddlerText: vi.fn().mockImplementation((title: string, def: string) => {
        if (title === '$:/config/ExternalAttachments/WikiFolderToMove') return externalFolder;
        return def;
      }),
    },
  } as unknown as WikiWithGetText;
}

describe('IpcServerRoutes.getFile', () => {
  let routes: IpcServerRoutes;

  beforeEach(() => {
    vi.resetAllMocks();
    routes = new IpcServerRoutes();
    routes.setSubWikiPaths([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retrieves file from main wiki when present', async () => {
    const wikiInstance = createMockWikiInstance({ wikiPath: '/main/wiki' });
    routes.setWikiInstance(wikiInstance);

    const tryReadSpy = vi.spyOn(routes as unknown as { tryReadFile: TryReadFileFn }, 'tryReadFile');
    tryReadSpy.mockResolvedValueOnce({ data: Buffer.from('PNG_DATA'), type: 'image/png' });

    const res = await routes.getFile('image.png');

    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Content-Type']).toBe('image/png');
    expect(Buffer.isBuffer(res.data)).toBe(true);
    expect(tryReadSpy).toHaveBeenCalledTimes(1);
  });

  it('retrieves file from first matching sub-wiki when not in main', async () => {
    const wikiInstance = createMockWikiInstance({ wikiPath: '/main/wiki' });
    routes.setWikiInstance(wikiInstance);
    routes.setSubWikiPaths(['/sub/wiki1', '/sub/wiki2']);

    const tryReadSpy = vi.spyOn(routes as unknown as { tryReadFile: TryReadFileFn }, 'tryReadFile');
    tryReadSpy
      .mockResolvedValueOnce(null) // main
      .mockResolvedValueOnce(null) // sub/wiki1
      .mockResolvedValueOnce({ data: Buffer.from('PNG_DATA'), type: 'image/png' }); // sub/wiki2

    const res = await routes.getFile('image.png');

    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Content-Type']).toBe('image/png');
    // Ensure call order: main -> sub1 -> sub2
    expect(tryReadSpy).toHaveBeenCalledTimes(3);
    const calls = tryReadSpy.mock.calls;
    expect(calls[0][0]).toBe('/main/wiki'); // wikiPath
    expect(calls[0][1]).toBe('files'); // external folder
    expect(calls[0][2]).toBe('image.png'); // supplied filename
    expect(calls[1][0]).toBe('/sub/wiki1');
    expect(calls[1][1]).toBe('files');
    expect(calls[1][2]).toBe('image.png');
    expect(calls[2][0]).toBe('/sub/wiki2');
    expect(calls[2][1]).toBe('files');
    expect(calls[2][2]).toBe('image.png');
  });

  it('blocks path traversal attempts (..)', async () => {
    const wikiInstance = createMockWikiInstance({ wikiPath: '/main/wiki' });
    routes.setWikiInstance(wikiInstance);

    const tryReadSpy = vi.spyOn(routes as unknown as { tryReadFile: TryReadFileFn }, 'tryReadFile');
    tryReadSpy.mockResolvedValueOnce(null);

    const res = await routes.getFile('../secret.png');

    expect(res.statusCode).toBe(404);
    expect(tryReadSpy).toHaveBeenCalledTimes(1);
    const calls = tryReadSpy.mock.calls;
    expect(calls[0][0]).toBe('/main/wiki');
    expect(calls[0][1]).toBe('files');
    expect(calls[0][2]).toBe('../secret.png');
  });

  it('returns 404 when file not found in main or any sub-wiki', async () => {
    const wikiInstance = createMockWikiInstance({ wikiPath: '/main/wiki' });
    routes.setWikiInstance(wikiInstance);
    routes.setSubWikiPaths(['/sub/wiki1']);

    const tryReadSpy = vi.spyOn(routes as unknown as { tryReadFile: TryReadFileFn }, 'tryReadFile');
    tryReadSpy
      .mockResolvedValueOnce(null) // main
      .mockResolvedValueOnce(null); // sub1

    const res = await routes.getFile('missing.png');

    expect(res.statusCode).toBe(404);
    expect(tryReadSpy).toHaveBeenCalledTimes(2);
  });

  it('uses configured external attachments folder name', async () => {
    const wikiInstance = createMockWikiInstance({ wikiPath: '/main/wiki', externalFolder: 'attachments' });
    routes.setWikiInstance(wikiInstance);

    const tryReadSpy = vi.spyOn(routes as unknown as { tryReadFile: TryReadFileFn }, 'tryReadFile');
    tryReadSpy.mockImplementation(async (wikiPathArg: string, externalFolderArg: string, supplied: string) => {
      // Assert it honors configured folder
      expect(externalFolderArg).toBe('attachments');
      // Return success to complete the flow
      if (wikiPathArg === '/main/wiki' && supplied === 'image.jpg') {
        return { data: Buffer.from('JPG_DATA'), type: 'image/jpeg' };
      }
      return null;
    });

    const res = await routes.getFile('image.jpg');

    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Content-Type']).toBe('image/jpeg');
    expect(tryReadSpy).toHaveBeenCalled();
  });
});
