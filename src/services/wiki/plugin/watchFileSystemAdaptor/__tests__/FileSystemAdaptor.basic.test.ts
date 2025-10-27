import { workspace } from '@services/wiki/wikiWorker/services';
import path from 'path';
import type { FileInfo, Tiddler, Wiki } from 'tiddlywiki';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemAdaptor } from '../FileSystemAdaptor';

// Mock the workspace service
vi.mock('@services/wiki/wikiWorker/services', () => ({
  workspace: {
    get: vi.fn(),
    getWorkspacesAsList: vi.fn(),
  },
}));

// Mock TiddlyWiki global
const mockLogger = {
  log: vi.fn(),
  alert: vi.fn(),
};

const mockUtils = {
  Logger: vi.fn(() => mockLogger),
  createDirectory: vi.fn(),
  generateTiddlerFileInfo: vi.fn(),
  saveTiddlerToFile: vi.fn(),
  deleteTiddlerFile: vi.fn(),
  cleanupTiddlerFiles: vi.fn(),
  getFileExtensionInfo: vi.fn(() => ({ type: 'application/x-tiddler' })),
};

// Setup TiddlyWiki global
// @ts-expect-error - Setting up global for testing
global.$tw = {
  node: true,
  boot: {
    wikiTiddlersPath: '/test/wiki/tiddlers',
    files: {} as Record<string, FileInfo>,
  },
  utils: mockUtils,
};

describe('FileSystemAdaptor - Basic Functionality', () => {
  let adaptor: FileSystemAdaptor;
  let mockWiki: Wiki;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset boot.files
    // @ts-expect-error - TiddlyWiki global
    global.$tw.boot.files = {};

    // Setup mock wiki
    mockWiki = {
      getTiddlerText: vi.fn(() => ''),
      tiddlerExists: vi.fn(() => false),
      addTiddler: vi.fn(),
    } as unknown as Wiki;

    // Reset workspace mocks
    vi.mocked(workspace.get).mockResolvedValue(
      {
        id: 'test-workspace',
        name: 'Test Workspace',
        wikiFolderLocation: '/test/wiki',
      } as Parameters<typeof workspace.get>[0] extends Promise<infer T> ? T : never,
    );

    vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([]);

    adaptor = new FileSystemAdaptor({
      wiki: mockWiki,
      // @ts-expect-error - TiddlyWiki global
      boot: global.$tw.boot,
    });
  });

  describe('Constructor & Initialization', () => {
    it('should initialize with correct properties', () => {
      expect(adaptor.name).toBe('filesystem');
      expect(adaptor.supportsLazyLoading).toBe(false);
      expect(adaptor.wiki).toBe(mockWiki);
    });

    it('should set watchPathBase from wikiTiddlersPath', () => {
      expect(adaptor['watchPathBase']).toBe(path.resolve('/test/wiki/tiddlers'));
    });

    it('should create directory for wikiTiddlersPath', () => {
      expect(mockUtils.createDirectory).toHaveBeenCalledWith('/test/wiki/tiddlers');
    });

    it('should throw error in non-Node.js environment', () => {
      // @ts-expect-error - TiddlyWiki global
      const originalNode = global.$tw.node;
      // @ts-expect-error - TiddlyWiki global
      global.$tw.node = false;

      expect(() => {
        new FileSystemAdaptor({ wiki: mockWiki });
      }).toThrow('filesystem adaptor only works in Node.js environment');

      // @ts-expect-error - TiddlyWiki global
      global.$tw.node = originalNode;
    });

    it('should initialize extension filters from wiki config', () => {
      const wikiWithConfig = {
        getTiddlerText: vi.fn(() => '.tid\n.json\n.png'),
        tiddlerExists: vi.fn((title) => title === '$:/config/FileSystemExtensions'),
        addTiddler: vi.fn(),
      } as unknown as Wiki;

      const adaptorWithFilters = new FileSystemAdaptor({
        wiki: wikiWithConfig,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      expect(adaptorWithFilters['extensionFilters']).toEqual(['.tid', '.json', '.png']);
    });

    it('should filter out empty lines from extension filters', () => {
      const wikiWithConfig = {
        getTiddlerText: vi.fn(() => '.tid\n\n.json\n  \n.png'),
        tiddlerExists: vi.fn((title) => title === '$:/config/FileSystemExtensions'),
        addTiddler: vi.fn(),
      } as unknown as Wiki;

      const adaptorWithFilters = new FileSystemAdaptor({
        wiki: wikiWithConfig,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      expect(adaptorWithFilters['extensionFilters']).toEqual(['.tid', '.json', '.png']);
    });
  });

  describe('getTiddlerInfo', () => {
    it('should return file info for existing tiddler', () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      const tiddler = { fields: { title: 'TestTiddler' } } as Tiddler;
      const result = adaptor.getTiddlerInfo(tiddler);

      expect(result).toBe(fileInfo);
    });

    it('should return undefined for non-existent tiddler', () => {
      const tiddler = { fields: { title: 'NonExistent' } } as Tiddler;
      const result = adaptor.getTiddlerInfo(tiddler);

      expect(result).toBeUndefined();
    });
  });

  describe('isReady', () => {
    it('should always return true', () => {
      expect(adaptor.isReady()).toBe(true);
    });
  });

  describe('loadTiddler', () => {
    it('should call callback with null (not needed during runtime)', () => {
      const callback = vi.fn();
      adaptor.loadTiddler('TestTiddler', callback);

      expect(callback).toHaveBeenCalledWith(null, null);
    });
  });

  describe('removeTiddlerFileInfo', () => {
    it('should remove tiddler from boot.files', () => {
      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = {
        filepath: '/test/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      adaptor.removeTiddlerFileInfo('TestTiddler');

      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler']).toBeUndefined();
    });

    it('should handle removing non-existent tiddler', () => {
      expect(() => {
        adaptor.removeTiddlerFileInfo('NonExistent');
      }).not.toThrow();
    });
  });
});
