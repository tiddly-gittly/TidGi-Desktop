import type { IWikiWorkspace } from '@services/workspaces/interface';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TiddlyWiki } from 'tiddlywiki';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FolderTiddlerScanError, type FolderTiddlerScanProgress, resolveFolderTiddlerStoragePath, scanFolderTiddlers } from '../folderTiddlerLoader';
import { createLoadWikiTiddlersWithSubWikis } from '../loadWikiTiddlersWithSubWikis';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'tidgi-folder-wiki-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFixtureFile(root: string, relativePath: string): string {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `title: ${relativePath}\n\nfixture`);
  return filePath;
}

function createFakeWiki() {
  const loadTiddlersFromFile = vi.fn((filePath: string) => ({
    filepath: filePath,
    hasMetaFile: false,
    isEditableFile: true,
    tiddlers: [{ title: path.basename(filePath) }],
    type: 'application/x-tiddler',
  }));
  const addTiddlers = vi.fn();
  const loadWikiTiddlers = vi.fn<(_wikiPath: string) => { plugins: never[] } | null>(() => ({ plugins: [] }));
  const wiki = {
    boot: {
      excludeRegExp: /^\.DS_Store$|^.*\.meta$|^\.git$/,
      files: {},
    },
    loadTiddlersFromFile,
    loadWikiTiddlers,
    wiki: { addTiddlers },
  } as unknown as ReturnType<typeof TiddlyWiki>;
  return { addTiddlers, loadTiddlersFromFile, loadWikiTiddlers, wiki };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('folder-as-tiddlers loading', () => {
  it('prefers an existing conventional tiddlers directory', () => {
    const root = createTemporaryDirectory();
    mkdirSync(path.join(root, 'tiddlers'));

    expect(resolveFolderTiddlerStoragePath(root)).toBe(realpathSync(path.join(root, 'tiddlers')));
  });

  it('skips infrastructure, metadata, and symlink cycles while loading nested tiddlers', () => {
    const root = createTemporaryDirectory();
    const one = writeFixtureFile(root, 'one.tid');
    const two = writeFixtureFile(root, 'nested/two.tid');
    writeFixtureFile(root, 'one.tid.meta');
    for (const excluded of ['.git', 'files', 'node_modules', 'output', 'cache', '.cache']) {
      writeFixtureFile(root, `${excluded}/must-not-load.tid`);
    }
    symlinkSync(root, path.join(root, 'nested', 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');
    const { loadTiddlersFromFile, wiki } = createFakeWiki();

    const result = scanFolderTiddlers(wiki, root);

    expect(loadTiddlersFromFile.mock.calls.map(([filePath]) => filePath)).toEqual([realpathSync(two), realpathSync(one)]);
    expect(result.scannedFileCount).toBe(2);
  });

  it('fails with a diagnostic error at the configured file boundary', () => {
    const root = createTemporaryDirectory();
    writeFixtureFile(root, 'one.tid');
    writeFixtureFile(root, 'two.tid');
    const { wiki } = createFakeWiki();

    expect(() => scanFolderTiddlers(wiki, root, { maxFiles: 1 })).toThrow(FolderTiddlerScanError);
    expect(() => scanFolderTiddlers(wiki, root, { maxFiles: 1 })).toThrow(/maximum file count 1/i);
  });

  it('fails with a diagnostic error at the configured depth boundary', () => {
    const root = createTemporaryDirectory();
    writeFixtureFile(root, 'nested/one.tid');
    const { wiki } = createFakeWiki();

    expect(() => scanFolderTiddlers(wiki, root, { maxDepth: 0 })).toThrow(/maximum depth 0/i);
  });

  it('reports bounded progress without exposing file contents', () => {
    const root = createTemporaryDirectory();
    writeFixtureFile(root, 'one.tid');
    const { wiki } = createFakeWiki();
    const onProgress = vi.fn();

    scanFolderTiddlers(wiki, root, { onProgress });

    expect(onProgress).toHaveBeenNthCalledWith(1, { scannedFileCount: 1, stage: 'before', storagePath: realpathSync(root) });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      durationBucket: expect.any(String),
      scannedFileCount: 1,
      stage: 'after',
      storagePath: realpathSync(root),
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('samples folder parsing progress at the first and every hundredth file', () => {
    const root = createTemporaryDirectory();
    for (let index = 1; index <= 101; index += 1) {
      writeFixtureFile(root, `${String(index).padStart(3, '0')}.tid`);
    }
    const { wiki } = createFakeWiki();
    const progressEvents: FolderTiddlerScanProgress[] = [];
    const onProgress = vi.fn((progress: FolderTiddlerScanProgress) => {
      progressEvents.push(progress);
    });

    scanFolderTiddlers(wiki, root, { onProgress });

    expect(progressEvents.map(progress => [progress.scannedFileCount, progress.stage])).toEqual([
      [1, 'before'],
      [1, 'after'],
      [100, 'before'],
      [100, 'after'],
    ]);
  });

  it('keeps standard and folder loading mutually exclusive and deduplicates physical roots', () => {
    const root = createTemporaryDirectory();
    const subWiki = createTemporaryDirectory();
    writeFixtureFile(root, 'tiddlers/main.tid');
    writeFixtureFile(subWiki, 'sub.tid');
    const { loadTiddlersFromFile, loadWikiTiddlers, wiki } = createFakeWiki();
    const duplicateSubWikis = [
      { wikiFolderLocation: root },
      { wikiFolderLocation: subWiki },
      { wikiFolderLocation: subWiki },
    ] as IWikiWorkspace[];
    const loader = createLoadWikiTiddlersWithSubWikis(
      wiki,
      root,
      duplicateSubWikis,
      { folderAsTiddlerStorage: true },
      { process: 'wiki-worker', scope: { kind: 'workspace', workspaceID: 'fixture' } },
      { logFor: vi.fn(async () => undefined) },
    );

    loader(root);

    expect(loadWikiTiddlers).not.toHaveBeenCalled();
    expect(loadTiddlersFromFile).toHaveBeenCalledTimes(2);
  });

  it('uses the stock loader exactly once for a standard tiddlywiki.info workspace', () => {
    const root = createTemporaryDirectory();
    writeFixtureFile(root, 'tiddlywiki.info');
    const { loadTiddlersFromFile, loadWikiTiddlers, wiki } = createFakeWiki();
    const loader = createLoadWikiTiddlersWithSubWikis(
      wiki,
      root,
      [{ wikiFolderLocation: root }] as IWikiWorkspace[],
      { folderAsTiddlerStorage: false },
      { process: 'wiki-worker', scope: { kind: 'workspace', workspaceID: 'fixture' } },
      { logFor: vi.fn(async () => undefined) },
    );

    loader(root);

    expect(loadWikiTiddlers).toHaveBeenCalledOnce();
    expect(loadTiddlersFromFile).not.toHaveBeenCalled();
  });

  it('does not bounded-scan a stock includeWiki that is also a configured sub-wiki', () => {
    const root = createTemporaryDirectory();
    const included = createTemporaryDirectory();
    writeFixtureFile(root, 'tiddlers/main.tid');
    writeFixtureFile(included, 'tiddlers/included.tid');
    const { loadTiddlersFromFile, loadWikiTiddlers, wiki } = createFakeWiki();
    const loaderReference: { current?: ReturnType<typeof createLoadWikiTiddlersWithSubWikis> } = {};
    loadWikiTiddlers.mockImplementation((wikiPath: string) => {
      if (wikiPath === root) loaderReference.current?.(included);
      return { plugins: [] };
    });
    const loader = createLoadWikiTiddlersWithSubWikis(
      wiki,
      root,
      [{ wikiFolderLocation: included }] as IWikiWorkspace[],
      { folderAsTiddlerStorage: false },
      { process: 'wiki-worker', scope: { kind: 'workspace', workspaceID: 'fixture' } },
      { logFor: vi.fn(async () => undefined) },
    );
    loaderReference.current = loader;

    loader(root);

    expect(loadWikiTiddlers).toHaveBeenCalledTimes(2);
    expect(loadTiddlersFromFile).not.toHaveBeenCalled();
  });

  it('bounded-scans a configured sub-wiki once when stock loading returns null', () => {
    const root = createTemporaryDirectory();
    const subWiki = createTemporaryDirectory();
    writeFixtureFile(subWiki, 'sub.tid');
    const { loadTiddlersFromFile, loadWikiTiddlers, wiki } = createFakeWiki();
    loadWikiTiddlers.mockImplementation((wikiPath: string) => wikiPath === root ? { plugins: [] } : null);
    const loader = createLoadWikiTiddlersWithSubWikis(
      wiki,
      root,
      [{ wikiFolderLocation: subWiki }, { wikiFolderLocation: subWiki }] as IWikiWorkspace[],
      { folderAsTiddlerStorage: false },
      { process: 'wiki-worker', scope: { kind: 'workspace', workspaceID: 'fixture' } },
      { logFor: vi.fn(async () => undefined) },
    );

    loader(root);

    expect(loadTiddlersFromFile).toHaveBeenCalledOnce();
  });
});
