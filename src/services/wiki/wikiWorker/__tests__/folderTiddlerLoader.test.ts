import type { IWikiWorkspace } from '@services/workspaces/interface';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TiddlyWiki } from 'tiddlywiki';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FolderTiddlerScanError, resolveFolderTiddlerStoragePath, scanFolderTiddlers } from '../folderTiddlerLoader';
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
  const loadWikiTiddlers = vi.fn(() => ({ plugins: [] }));
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

    expect(onProgress).toHaveBeenCalledExactlyOnceWith({ scannedFileCount: 1, storagePath: realpathSync(root) });
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
});
