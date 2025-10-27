import { workspace } from '@services/wiki/wikiWorker/services';
import type { FileInfo, Wiki } from 'tiddlywiki';
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

describe('FileSystemAdaptor - Delete Operations', () => {
  let adaptor: FileSystemAdaptor;
  let mockWiki: Wiki;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // @ts-expect-error - TiddlyWiki global
    global.$tw.boot.files = {};
    
    mockWiki = {
      getTiddlerText: vi.fn(() => ''),
      tiddlerExists: vi.fn(() => false),
      addTiddler: vi.fn(),
    } as unknown as Wiki;

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

  describe('deleteTiddler - Callback Mode', () => {
    it('should delete tiddler and call callback on success', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(null, fileInfo);
      });

      const callback = vi.fn();

      await adaptor.deleteTiddler('TestTiddler', callback);

      expect(callback).toHaveBeenCalledWith(null, null);
      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler']).toBeUndefined();
    });

    it('should call callback immediately when tiddler not found', async () => {
      const callback = vi.fn();

      await adaptor.deleteTiddler('NonExistent', callback);

      expect(callback).toHaveBeenCalledWith(null, null);
      expect(mockUtils.deleteTiddlerFile).not.toHaveBeenCalled();
    });

    it('should handle EPERM error gracefully', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      const error: NodeJS.ErrnoException = new Error('Permission denied');
      error.code = 'EPERM';
      error.syscall = 'unlink';

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(error, fileInfo);
      });

      const callback = vi.fn();

      await adaptor.deleteTiddler('TestTiddler', callback);

      // Should succeed despite error
      expect(callback).toHaveBeenCalledWith(null, fileInfo);
      expect(mockLogger.alert).toHaveBeenCalledWith(
        expect.stringContaining('Server desynchronized'),
      );
      // File info should NOT be removed for EPERM errors
      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler']).toBeDefined();
    });

    it('should handle EACCES error gracefully', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      const error: NodeJS.ErrnoException = new Error('Access denied');
      error.code = 'EACCES';
      error.syscall = 'unlink';

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(error, fileInfo);
      });

      const callback = vi.fn();

      await adaptor.deleteTiddler('TestTiddler', callback);

      expect(callback).toHaveBeenCalledWith(null, fileInfo);
      expect(mockLogger.alert).toHaveBeenCalled();
    });

    it('should propagate non-permission errors', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      const error = new Error('Disk full');

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(error);
      });

      const callback = vi.fn();

      await expect(adaptor.deleteTiddler('TestTiddler', callback)).rejects.toThrow('Disk full');

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should not treat EPERM as graceful if syscall is not unlink', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      const error: NodeJS.ErrnoException = new Error('Permission denied');
      error.code = 'EPERM';
      error.syscall = 'read'; // Different syscall

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(error);
      });

      const callback = vi.fn();

      await expect(adaptor.deleteTiddler('TestTiddler', callback)).rejects.toThrow();
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('deleteTiddler - Async/Await Mode', () => {
    it('should resolve successfully without callback', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(null, fileInfo);
      });

      await expect(adaptor.deleteTiddler('TestTiddler')).resolves.toBeUndefined();
      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler']).toBeUndefined();
    });

    it('should resolve immediately for non-existent tiddler', async () => {
      await expect(adaptor.deleteTiddler('NonExistent')).resolves.toBeUndefined();
      expect(mockUtils.deleteTiddlerFile).not.toHaveBeenCalled();
    });

    it('should reject on non-permission errors', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(new Error('IO error'));
      });

      await expect(adaptor.deleteTiddler('TestTiddler')).rejects.toThrow('IO error');
    });

    it('should handle permission errors gracefully even without callback', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      const error: NodeJS.ErrnoException = new Error('Permission denied');
      error.code = 'EPERM';
      error.syscall = 'unlink';

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb(error, fileInfo);
      });

      // Should not throw
      await expect(adaptor.deleteTiddler('TestTiddler')).resolves.toBeUndefined();
      expect(mockLogger.alert).toHaveBeenCalled();
    });
  });

  describe('deleteTiddler - Error Conversion', () => {
    it('should convert string errors to Error objects', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb('String error' as unknown as Error);
      });

      const callback = vi.fn();

      await expect(adaptor.deleteTiddler('TestTiddler', callback)).rejects.toThrow('String error');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        message: 'String error',
      }));
    });

    it('should convert unknown errors to Error objects', async () => {
      const fileInfo: FileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = fileInfo;

      mockUtils.deleteTiddlerFile.mockImplementation((_f, cb) => {
        cb({ weird: 'object' } as unknown as Error);
      });

      const callback = vi.fn();

      await expect(adaptor.deleteTiddler('TestTiddler', callback)).rejects.toThrow('Unknown error');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Unknown error',
      }));
    });
  });
});
