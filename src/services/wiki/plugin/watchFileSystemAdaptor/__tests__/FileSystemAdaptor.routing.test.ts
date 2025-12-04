import { workspace } from '@services/wiki/wikiWorker/services';
import type { IWikiWorkspace } from '@services/workspaces/interface';
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

describe('FileSystemAdaptor - Routing Logic', () => {
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

    mockUtils.generateTiddlerFileInfo.mockReturnValue({
      filepath: '/test/wiki/tiddlers/test.tid',
      type: 'application/x-tiddler',
      hasMetaFile: false,
    });
  });

  describe('getTiddlerFileInfo - Default Routing', () => {
    beforeEach(async () => {
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

    it('should generate file info for tiddler without tags', async () => {
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      const result = await adaptor.getTiddlerFileInfo(tiddler);

      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/tiddlers',
          pathFilters: undefined,
          wiki: mockWiki,
        }),
      );
      expect(result).toBeTruthy();
    });

    it('should use FileSystemPaths config when available', async () => {
      vi.mocked(mockWiki.tiddlerExists).mockImplementation((title) => title === '$:/config/FileSystemPaths');
      vi.mocked(mockWiki.getTiddlerText).mockReturnValue('[tag[Journal]]/journal/\n[tag[Task]]/tasks/');

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      await adaptor.getTiddlerFileInfo(tiddler);

      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          pathFilters: ['[tag[Journal]]/journal/', '[tag[Task]]/tasks/'],
        }),
      );
    });

    it('should filter out empty lines from FileSystemPaths', async () => {
      vi.mocked(mockWiki.tiddlerExists).mockImplementation((title) => title === '$:/config/FileSystemPaths');
      vi.mocked(mockWiki.getTiddlerText).mockReturnValue('[tag[Journal]]/journal/\n\n[tag[Task]]/tasks/\n  ');

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      await adaptor.getTiddlerFileInfo(tiddler);

      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          pathFilters: ['[tag[Journal]]/journal/', '[tag[Task]]/tasks/'],
        }),
      );
    });

    it('should pass extension filters to generateTiddlerFileInfo', async () => {
      const wikiWithConfig = {
        getTiddlerText: vi.fn((title) => {
          if (title === '$:/config/FileSystemExtensions') return '.tid\n.json';
          return '';
        }),
        tiddlerExists: vi.fn((title) => title === '$:/config/FileSystemExtensions'),
        addTiddler: vi.fn(),
      } as unknown as Wiki;

      adaptor = new FileSystemAdaptor({
        wiki: wikiWithConfig,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      await adaptor.getTiddlerFileInfo(tiddler);

      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          extFilters: ['.tid', '.json'],
        }),
      );
    });

    it('should pass existing fileInfo with overwrite flag', async () => {
      const existingFileInfo: IFileInfo = {
        filepath: '/test/old.tid',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = existingFileInfo;

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      await adaptor.getTiddlerFileInfo(tiddler);

      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          fileInfo: expect.objectContaining({
            overwrite: true,
          }),
        }),
      );
    });

    it('should throw error when wikiTiddlersPath is not set', async () => {
      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.wikiTiddlersPath = undefined;

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler' },
      } as unknown as Tiddler;

      await expect(adaptor.getTiddlerFileInfo(tiddler)).rejects.toThrow(
        'filesystem adaptor requires a valid wiki folder',
      );

      // Restore for other tests
      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.wikiTiddlersPath = '/test/wiki/tiddlers';
    });
  });

  describe('getTiddlerFileInfo - Sub-Wiki Routing', () => {
    beforeEach(async () => {
      vi.mocked(workspace.get).mockResolvedValue(
        {
          id: 'test-workspace',
          name: 'Test Workspace',
          wikiFolderLocation: '/test/wiki',
        } as Parameters<typeof workspace.get>[0] extends Promise<infer T> ? T : never,
      );

      // Setup mock wiki with workspace ID
      mockWiki = {
        getTiddlerText: vi.fn((title) => {
          if (title === '$:/info/tidgi/workspaceID') return 'test-workspace';
          return '';
        }),
        tiddlerExists: vi.fn(() => false),
        addTiddler: vi.fn(),
      } as unknown as Wiki;
    });

    it('should route to sub-wiki when tiddler has matching tag', async () => {
      const subWiki = {
        id: 'sub-wiki-1',
        name: 'Sub Wiki',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagName: 'SubWikiTag',
        wikiFolderLocation: '/test/wiki/subwiki/sub1',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki] as IWikiWorkspace[]);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      // Manually trigger cache update and wait for it
      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: ['SubWikiTag', 'OtherTag'] },
      } as Tiddler;

      await adaptor.getTiddlerFileInfo(tiddler);

      expect(mockUtils.createDirectory).toHaveBeenCalledWith('/test/wiki/subwiki/sub1');
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/subwiki/sub1',
          pathFilters: undefined, // Sub-wikis don't use path filters
        }),
      );
    });

    it('should use first matching tag when multiple sub-wiki tags exist', async () => {
      const subWiki1 = {
        id: 'sub-1',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagName: 'Tag1',
        wikiFolderLocation: '/test/wiki/sub1',
      };

      const subWiki2 = {
        id: 'sub-2',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagName: 'Tag2',
        wikiFolderLocation: '/test/wiki/sub2',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki1, subWiki2] as IWikiWorkspace[]);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      // Manually trigger cache update and wait for it
      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: ['Tag1', 'Tag2'] },
      } as Tiddler;

      await adaptor.getTiddlerFileInfo(tiddler);

      // Should use Tag1's directory (first match)
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/sub1',
        }),
      );
    });

    it('should use default path when no matching sub-wiki (various scenarios)', async () => {
      // Test scenario 1: Tag doesn't match
      const subWikiWithDifferentTag = {
        id: 'sub-wiki-1',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagName: 'SubWikiTag',
        wikiFolderLocation: '/test/wiki/subwiki',
      };

      // Test scenario 2: Sub-wiki without tagName
      const subWikiWithoutTag = {
        id: 'sub-wiki-2',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        wikiFolderLocation: '/test/wiki/subwiki2',
      };

      // Test scenario 3: Sub-wiki from different main wiki
      const otherMainWikiSubWiki = {
        id: 'sub-wiki-3',
        isSubWiki: true,
        mainWikiID: 'other-workspace',
        tagName: 'AnotherTag',
        wikiFolderLocation: '/test/otherwiki/subwiki',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([
        subWikiWithDifferentTag,
        subWikiWithoutTag,
        otherMainWikiSubWiki,
      ] as IWikiWorkspace[]);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      // Manually trigger cache update and wait for it
      await adaptor['updateSubWikisCache']();

      // Tiddler with unmatched tags
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: ['UnmatchedTag'] },
      } as Tiddler;

      await adaptor.getTiddlerFileInfo(tiddler);

      // Should use default directory in all scenarios
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/tiddlers',
        }),
      );
    });
  });

  describe('getTiddlerFileInfo - Error Handling', () => {
    beforeEach(async () => {
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

    it('should fallback to default routing on error', async () => {
      mockUtils.generateTiddlerFileInfo
        .mockImplementationOnce(() => {
          throw new Error('Test error');
        })
        .mockReturnValue({
          filepath: '/test/wiki/tiddlers/test.tid',
          type: 'application/x-tiddler',
          hasMetaFile: false,
        });

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      const result = await adaptor.getTiddlerFileInfo(tiddler);

      expect(mockLogger.alert).toHaveBeenCalledWith(
        expect.stringContaining('Error in getTiddlerFileInfo'),
        expect.any(Error),
      );
      expect(result).toBeTruthy();
      // Should have tried twice: once failed, once fallback
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateSubWikisCache', () => {
    it('should clear cache when workspaceID is empty', async () => {
      const wikiWithoutID = {
        getTiddlerText: vi.fn(() => ''), // Empty workspace ID
        tiddlerExists: vi.fn(() => false),
        addTiddler: vi.fn(),
      } as unknown as Wiki;

      adaptor = new FileSystemAdaptor({
        wiki: wikiWithoutID,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      // Manually trigger cache update and wait for it
      await adaptor['updateSubWikisCache']();

      expect(adaptor['wikisWithTag']).toEqual([]);
      expect(adaptor['tagNameToWiki'].size).toBe(0);
    });

    it('should clear cache when currentWorkspace is not found', async () => {
      vi.mocked(workspace.get).mockResolvedValue(undefined);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      // Manually trigger cache update and wait for it
      await adaptor['updateSubWikisCache']();

      expect(adaptor['wikisWithTag']).toEqual([]);
      expect(adaptor['tagNameToWiki'].size).toBe(0);
    });

    it('should handle errors in updateSubWikisCache gracefully', async () => {
      vi.mocked(workspace.get).mockResolvedValue(
        {
          id: 'test-workspace',
          name: 'Test Workspace',
          wikiFolderLocation: '/test/wiki',
        } as Parameters<typeof workspace.get>[0] extends Promise<infer T> ? T : never,
      );

      vi.mocked(workspace.getWorkspacesAsList).mockRejectedValue(new Error('Database error'));

      const wikiWithID = {
        getTiddlerText: vi.fn((title) => {
          if (title === '$:/info/tidgi/workspaceID') return 'test-workspace';
          return '';
        }),
        tiddlerExists: vi.fn(() => false),
        addTiddler: vi.fn(),
      } as unknown as Wiki;

      adaptor = new FileSystemAdaptor({
        wiki: wikiWithID,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      // Manually trigger cache update to catch the error
      await adaptor['updateSubWikisCache']();

      // The error should have been logged
      expect(mockLogger.alert).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update sub-wikis cache'),
        expect.any(Error),
      );
    });
  });
});
