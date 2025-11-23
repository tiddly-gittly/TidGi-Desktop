import { workspace } from '@services/wiki/wikiWorker/services';
import type { IFileInfo, Tiddler, Wiki } from 'tiddlywiki';
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
    files: {} as Record<string, IFileInfo>,
  },
  utils: mockUtils,
};

describe('FileSystemAdaptor - Save Operations', () => {
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

  describe('saveTiddler - Callback Mode', () => {
    it('should save tiddler and call callback on success', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', text: 'Test content' },
      } as Tiddler;

      const fileInfo: IFileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      mockUtils.generateTiddlerFileInfo.mockReturnValue(fileInfo);
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(null, fileInfo);
      });
      mockUtils.cleanupTiddlerFiles.mockImplementation((_opts, cb) => {
        cb(null, fileInfo);
      });

      const callback = vi.fn();

      await adaptor.saveTiddler(tiddler, callback);

      expect(callback).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          filepath: '/test/wiki/tiddlers/test.tid',
        }),
      );
      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler']).toBeDefined();
      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler'].isEditableFile).toBe(true);
    });

    it('should call callback with error when getTiddlerFileInfo returns null', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      mockUtils.generateTiddlerFileInfo.mockReturnValue(null);

      const callback = vi.fn();

      await expect(adaptor.saveTiddler(tiddler, callback)).rejects.toThrow(
        'No fileInfo returned from getTiddlerFileInfo',
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No fileInfo returned from getTiddlerFileInfo',
        }),
      );
    });

    it('should call callback with error when saveTiddlerToFile fails', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      mockUtils.generateTiddlerFileInfo.mockReturnValue({
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      });

      const saveError = new Error('File write failed');
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(saveError);
      });

      const callback = vi.fn();

      await expect(adaptor.saveTiddler(tiddler, callback)).rejects.toThrow();

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle cleanup errors', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      const fileInfo: IFileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      mockUtils.generateTiddlerFileInfo.mockReturnValue(fileInfo);
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(null, fileInfo);
      });
      mockUtils.cleanupTiddlerFiles.mockImplementation((_opts, cb) => {
        cb(new Error('Cleanup failed'));
      });

      const callback = vi.fn();

      await expect(adaptor.saveTiddler(tiddler, callback)).rejects.toThrow('Cleanup failed');
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('saveTiddler - Async/Await Mode', () => {
    it('should resolve successfully without callback', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      const fileInfo: IFileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      mockUtils.generateTiddlerFileInfo.mockReturnValue(fileInfo);
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(null, fileInfo);
      });
      mockUtils.cleanupTiddlerFiles.mockImplementation((_opts, cb) => {
        cb(null, fileInfo);
      });

      await expect(adaptor.saveTiddler(tiddler)).resolves.toBeUndefined();
      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler']).toBeDefined();
    });

    it('should reject when getTiddlerFileInfo returns null', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      mockUtils.generateTiddlerFileInfo.mockReturnValue(null);

      await expect(adaptor.saveTiddler(tiddler)).rejects.toThrow(
        'No fileInfo returned from getTiddlerFileInfo',
      );
    });

    it('should reject when saveTiddlerToFile fails', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      mockUtils.generateTiddlerFileInfo.mockReturnValue({
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      });

      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(new Error('Write failed'));
      });

      await expect(adaptor.saveTiddler(tiddler)).rejects.toThrow();
    });

    it('should preserve isEditableFile from existing fileInfo', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      const fileInfo: IFileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
        isEditableFile: false,
      };

      mockUtils.generateTiddlerFileInfo.mockReturnValue(fileInfo);
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(null, fileInfo);
      });
      mockUtils.cleanupTiddlerFiles.mockImplementation((_opts, cb) => {
        cb(null, fileInfo);
      });

      await adaptor.saveTiddler(tiddler);

      // @ts-expect-error - TiddlyWiki global
      expect(global.$tw.boot.files['TestTiddler'].isEditableFile).toBe(false);
    });
  });

  describe('saveTiddler - File Lock Retry', () => {
    it('should retry on EBUSY error', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      const fileInfo: IFileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      mockUtils.generateTiddlerFileInfo.mockReturnValue(fileInfo);

      let attemptCount = 0;
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        attemptCount++;
        if (attemptCount < 3) {
          const error: NodeJS.ErrnoException = new Error('File is busy');
          error.code = 'EBUSY';
          cb(error);
        } else {
          cb(null, fileInfo);
        }
      });

      mockUtils.cleanupTiddlerFiles.mockImplementation((_opts, cb) => {
        cb(null, fileInfo);
      });

      const callback = vi.fn();

      await adaptor.saveTiddler(tiddler, callback);

      expect(attemptCount).toBeGreaterThan(1);
      expect(callback).toHaveBeenCalledWith(null, expect.any(Object));
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('is locked'),
      );
    });

    it('should retry on EPERM error', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      const fileInfo: IFileInfo = {
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      mockUtils.generateTiddlerFileInfo.mockReturnValue(fileInfo);

      let attemptCount = 0;
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        attemptCount++;
        if (attemptCount < 2) {
          const error: NodeJS.ErrnoException = new Error('Permission denied');
          error.code = 'EPERM';
          cb(error);
        } else {
          cb(null, fileInfo);
        }
      });

      mockUtils.cleanupTiddlerFiles.mockImplementation((_opts, cb) => {
        cb(null, fileInfo);
      });

      await adaptor.saveTiddler(tiddler);

      expect(attemptCount).toBe(2);
    });

    it('should give up after max retries on persistent lock', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      mockUtils.generateTiddlerFileInfo.mockReturnValue({
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      });

      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        const error: NodeJS.ErrnoException = new Error('File is locked');
        error.code = 'EBUSY';
        cb(error);
      });

      const callback = vi.fn();

      await expect(adaptor.saveTiddler(tiddler, callback)).rejects.toThrow();

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Failed to save'),
      }));
      expect(mockUtils.saveTiddlerToFile).toHaveBeenCalledTimes(10); // Default max retries
      expect(mockWiki.addTiddler).toHaveBeenCalled(); // Error notification created
    });

    it('should not retry on non-lock errors', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      mockUtils.generateTiddlerFileInfo.mockReturnValue({
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      });

      const diskFullError = new Error('Disk full');
      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(diskFullError);
      });

      await expect(adaptor.saveTiddler(tiddler)).rejects.toThrow();

      // Should only try once for non-lock errors
      expect(mockUtils.saveTiddlerToFile).toHaveBeenCalledTimes(1);
      expect(mockWiki.addTiddler).toHaveBeenCalled(); // Error notification created
    });

    it('should create error notification with correct details', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as Tiddler;

      mockUtils.generateTiddlerFileInfo.mockReturnValue({
        filepath: '/test/wiki/tiddlers/test.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      });

      mockUtils.saveTiddlerToFile.mockImplementation((_t, _f, cb) => {
        cb(new Error('Test error'));
      });

      await expect(adaptor.saveTiddler(tiddler)).rejects.toThrow();

      expect(mockWiki.addTiddler).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '$:/temp/filesystem/error/TestTiddler',
          tags: ['$:/tags/Alert'],
          'error-type': 'file-save-error',
          'original-title': 'TestTiddler',
          text: expect.stringContaining('Failed to save tiddler "TestTiddler"'),
        }),
      );
    });
  });
});
