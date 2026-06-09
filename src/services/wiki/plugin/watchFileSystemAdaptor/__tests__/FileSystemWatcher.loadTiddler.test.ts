/**
 * Tests for FileSystemWatcher.loadTiddler() file format type preservation.
 *
 * This test suite verifies the fix for the bug where tiddlers would mysteriously
 * change from .tid format to .json format on disk.
 *
 * Root cause: loadTiddler() was using the tiddler's content type (e.g. 'text/markdown')
 * instead of the file format type (e.g. 'application/x-tiddler') when updating boot.files.
 * This caused saveTiddlerToFile() to save as JSON instead of .tid format.
 */
import type { IFileInfo, Wiki } from 'tiddlywiki';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemWatcher, type IFileChange } from '../FileSystemWatcher';

// Mock TiddlyWiki global
const mockLogger = {
  log: vi.fn(),
  alert: vi.fn(),
};

const mockUtils = {
  Logger: vi.fn(function() {
    return mockLogger;
  }),
  createDirectory: vi.fn(),
};

// Setup TiddlyWiki global
// @ts-expect-error - Setting up global for testing
global.$tw = {
  node: true,
  boot: {
    wikiTiddlersPath: '/test/wiki/tiddlers',
    wikiPath: '/test/wiki',
    files: {} as Record<string, IFileInfo>,
  },
  utils: mockUtils,
  syncer: null,
};

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    statSync: vi.fn(() => ({ mtimeMs: 1000, size: 100 })),
    readFile: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ mtimeMs: 1000, size: 100 })),
}));

// Mock nsfw
vi.mock('nsfw', () => ({
  default: vi.fn().mockResolvedValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
  actions: {
    CREATED: 0,
    DELETED: 1,
    MODIFIED: 2,
    RENAMED: 3,
  },
}));

// Mock workspace service
vi.mock('@services/wiki/wikiWorker/services', () => ({
  workspace: {
    get: vi.fn(),
    getSubWorkspacesAsList: vi.fn().mockResolvedValue([]),
  },
  git: {
    notifyFileChange: vi.fn(),
  },
}));

describe('FileSystemWatcher - loadTiddler file format type preservation', () => {
  let watcher: FileSystemWatcher;
  let mockWiki: Wiki;

  beforeEach(() => {
    vi.clearAllMocks();

    // @ts-expect-error - Setting up global for testing
    global.$tw.boot.files = {};

    mockWiki = {
      getTiddlerText: vi.fn((title: string) => {
        if (title === '$:/info/tidgi/useWikiFolderAsTiddlersPath') return 'no';
        return '';
      }),
      tiddlerExists: vi.fn(() => false),
      getTiddler: vi.fn(() => undefined),
    } as unknown as Wiki;

    watcher = new FileSystemWatcher({
      wiki: mockWiki,
      // @ts-expect-error - Setting up global for testing
      boot: global.$tw.boot,
      logger: mockLogger as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      workspaceID: 'test-workspace',
    });
  });

  /**
   * Helper to inject a pendingFileLoads entry and call loadTiddler.
   * Returns the boot.files entry that was set by loadTiddler.
   */
  function injectAndLoad(fileChange: IFileChange): IFileInfo {
    // Inject the file change into pendingFileLoads
    (watcher as any).pendingFileLoads.set(fileChange.cachedTiddlerFields?.title ?? 'Test', fileChange); // eslint-disable-line @typescript-eslint/no-explicit-any

    const title = fileChange.cachedTiddlerFields?.title as string;
    let result: IFileInfo | null = null;
    watcher.loadTiddler(title, (_err, _fields) => {
      // loadTiddler sets boot.files[title] as a side effect
      result = (globalThis as unknown as { $tw: { boot: { files: Record<string, IFileInfo> } } }).$tw.boot.files[title];
    });
    return result!;
  }

  describe('Type preservation with cached tiddler fields', () => {
    it('should use fileDescriptor.type (application/x-tiddler) not tiddler.type (text/markdown) for .tid files', () => {
      const bootFileInfo = injectAndLoad({
        absolutePath: '/test/wiki/tiddlers/my-note.tid',
        relativePath: 'my-note.tid',
        type: 'change',
        cachedTiddlerFields: {
          title: 'My Note',
          text: '# Hello World',
          type: 'text/markdown', // Tiddler's content type
          modified: '20250101120000000',
        },
        cachedFileDescriptor: {
          type: 'application/x-tiddler', // File format type (correct!)
          hasMetaFile: false,
          isEditableFile: true,
        },
      });

      // Verify loadTiddler set the file format type, not the content type
      expect(bootFileInfo.type).toBe('application/x-tiddler');
      expect(bootFileInfo.type).not.toBe('text/markdown');
    });

    it('should use application/json type for .json files', () => {
      const bootFileInfo = injectAndLoad({
        absolutePath: '/test/wiki/tiddlers/my-data.json',
        relativePath: 'my-data.json',
        type: 'change',
        cachedTiddlerFields: {
          title: 'My Data',
          text: '{"key": "value"}',
          type: 'application/json',
          modified: '20250101120000000',
        },
        cachedFileDescriptor: {
          type: 'application/json',
          hasMetaFile: false,
          isEditableFile: true,
        },
      });

      expect(bootFileInfo.type).toBe('application/json');
    });

    it('should fall back to extension-based inference when cachedFileDescriptor is missing', () => {
      const bootFileInfo = injectAndLoad({
        absolutePath: '/test/wiki/tiddlers/my-note.tid',
        relativePath: 'my-note.tid',
        type: 'change',
        cachedTiddlerFields: {
          title: 'My Note',
          text: '# Hello',
          type: 'text/markdown',
        },
        // No cachedFileDescriptor!
      });

      // Should infer application/x-tiddler from .tid extension
      expect(bootFileInfo.type).toBe('application/x-tiddler');
    });

    it('should infer application/json for .json extension when cachedFileDescriptor is missing', () => {
      const bootFileInfo = injectAndLoad({
        absolutePath: '/test/wiki/tiddlers/data.json',
        relativePath: 'data.json',
        type: 'change',
        cachedTiddlerFields: {
          title: 'Data',
          text: '{}',
          type: 'application/json',
        },
      });

      expect(bootFileInfo.type).toBe('application/json');
    });
  });

  describe('BUG SCENARIO: .tid file with non-standard content type', () => {
    it('should NOT change .tid to .json when tiddler has type text/markdown', () => {
      // This is the exact scenario from the bug report:
      // 1. Tiddler saved as .tid (type: 'text/markdown')
      // 2. Watcher detects change, loads file
      // 3. fileDescriptor.type = 'application/x-tiddler' (correct)
      // 4. tiddler.type = 'text/markdown' (content type)
      // 5. OLD BUG: boot.files[title].type = 'text/markdown' → next save = JSON!
      // 6. FIX: boot.files[title].type = 'application/x-tiddler' → next save = .tid ✓
      const bootFileInfo = injectAndLoad({
        absolutePath: '/test/wiki/tiddlers/my-note.tid',
        relativePath: 'my-note.tid',
        type: 'change',
        cachedTiddlerFields: {
          title: 'My Note',
          text: '# Hello',
          type: 'text/markdown',
        },
        cachedFileDescriptor: {
          type: 'application/x-tiddler',
          hasMetaFile: false,
          isEditableFile: true,
        },
      });

      expect(bootFileInfo.type).toBe('application/x-tiddler');
      expect(bootFileInfo.type).not.toBe('text/markdown');
    });

    it('should NOT change .tid to .json when tiddler has type text/plain', () => {
      const bootFileInfo = injectAndLoad({
        absolutePath: '/test/wiki/tiddlers/plain-note.tid',
        relativePath: 'plain-note.tid',
        type: 'change',
        cachedTiddlerFields: {
          title: 'Plain Note',
          text: 'Just plain text',
          type: 'text/plain',
        },
        cachedFileDescriptor: {
          type: 'application/x-tiddler',
          hasMetaFile: false,
          isEditableFile: true,
        },
      });

      expect(bootFileInfo.type).toBe('application/x-tiddler');
    });

    it('should preserve image/png type for binary tiddlers with .meta', () => {
      const bootFileInfo = injectAndLoad({
        absolutePath: '/test/wiki/tiddlers/photo.png',
        relativePath: 'photo.png',
        type: 'change',
        cachedTiddlerFields: {
          title: 'photo.png',
          type: 'image/png',
        },
        cachedFileDescriptor: {
          type: 'image/png',
          hasMetaFile: true,
          isEditableFile: true,
        },
      });

      expect(bootFileInfo.type).toBe('image/png');
      expect(bootFileInfo.hasMetaFile).toBe(true);
    });
  });
});
