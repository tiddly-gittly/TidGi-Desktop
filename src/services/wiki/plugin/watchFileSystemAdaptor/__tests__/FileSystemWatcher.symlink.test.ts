import type { IFileInfo, Wiki } from 'tiddlywiki';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemWatcher } from '../FileSystemWatcher';

const fileSystem = vi.hoisted(() => ({
  lstatSync: vi.fn(),
  statSync: vi.fn(),
}));
const nsfw = vi.hoisted(() => ({
  actions: { CREATED: 0, DELETED: 1, MODIFIED: 2, RENAMED: 3 },
}));

vi.mock('fs', () => ({
  default: fileSystem,
  lstatSync: fileSystem.lstatSync,
  statSync: fileSystem.statSync,
}));

vi.mock('nsfw', () => ({
  actions: nsfw.actions,
  default: Object.assign(vi.fn(), { actions: nsfw.actions }),
}));

vi.mock('@services/wiki/wikiWorker/services', () => ({
  git: { notifyFileChange: vi.fn() },
  workspace: { getSubWorkspacesAsList: vi.fn() },
}));

const logger = { alert: vi.fn(), log: vi.fn() };

// @ts-expect-error - Unit tests only require the TiddlyWiki globals used by this module.
global.$tw = {
  boot: {
    files: {} as Record<string, IFileInfo>,
    wikiPath: '/test/wiki',
    wikiTiddlersPath: '/test/wiki/tiddlers',
  },
  syncer: null,
};

type InternalWatcher = {
  getWikiRootPath: () => string;
  handleFileAddOrChange: (absolutePath: string, relativePath: string, extension: string, type: 'add' | 'change') => void;
  handleNsfwEvents: (events: unknown) => void;
};

function createWatcher(ignoreSymlinks: boolean): FileSystemWatcher {
  const wiki = { getTiddlerText: vi.fn(() => 'files') } as unknown as Wiki;
  return new FileSystemWatcher({
    // @ts-expect-error - Test global supplies the boot fields used by the watcher.
    boot: global.$tw.boot,
    logger: logger as never,
    wiki,
    workspaceConfig: { enableFileSystemWatch: true, ignoreSymlinks } as never,
    workspaceID: 'workspace',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // @ts-expect-error - Test global supplies the boot fields used by the watcher.
  global.$tw.boot.wikiPath = '/test/wiki';
  // @ts-expect-error - Test global supplies the boot fields used by the watcher.
  global.$tw.boot.wikiTiddlersPath = '/test/wiki/tiddlers';
  fileSystem.lstatSync.mockReturnValue({ isDirectory: () => false, isSymbolicLink: () => true });
  fileSystem.statSync.mockReturnValue({ isDirectory: () => false, mtimeMs: 1, size: 1 });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('FileSystemWatcher symlink policy', () => {
  it('uses wikiPath, not the parent of root storage, for Git notifications', () => {
    // @ts-expect-error - Test global supplies the boot fields used by the watcher.
    global.$tw.boot.wikiTiddlersPath = '/test/wiki';
    const watcher = createWatcher(true);

    expect((watcher as unknown as InternalWatcher).getWikiRootPath()).toBe('/test/wiki');
  });

  it('skips a symbolic link by default', () => {
    const watcher = createWatcher(true);
    const internalWatcher = watcher as unknown as InternalWatcher;
    const handleFileAddOrChange = vi.spyOn(internalWatcher, 'handleFileAddOrChange');

    internalWatcher.handleNsfwEvents([{ action: 0, directory: '/test/wiki/tiddlers', file: 'linked.tid' }]);

    expect(handleFileAddOrChange).not.toHaveBeenCalled();
    expect(fileSystem.statSync).not.toHaveBeenCalled();
  });

  it('processes a symbolic link when the workspace explicitly allows it', () => {
    const watcher = createWatcher(false);
    const internalWatcher = watcher as unknown as InternalWatcher;
    const handleFileAddOrChange = vi.spyOn(internalWatcher, 'handleFileAddOrChange');

    internalWatcher.handleNsfwEvents([{ action: 0, directory: '/test/wiki/tiddlers', file: 'linked.tid' }]);

    expect(fileSystem.statSync).toHaveBeenCalledWith('/test/wiki/tiddlers/linked.tid');
    expect(handleFileAddOrChange).toHaveBeenCalledWith(
      '/test/wiki/tiddlers/linked.tid',
      'linked.tid',
      '.tid',
      'add',
    );
  });
});
