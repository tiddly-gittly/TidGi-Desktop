import { workspace } from '@services/wiki/wikiWorker/services';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import type { IFileInfo, Tiddler, Wiki } from 'tiddlywiki';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemAdaptor } from '../FileSystemAdaptor';
// @ts-expect-error TS2459: Module declares 'matchTiddlerToWorkspace' locally, but it is not exported. Ignore: TiddlyWiki uses exports.xxx style.
import { isWikiWorkspaceWithRouting, matchTiddlerToWorkspace } from '../routingUtilities';

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
  matchTiddlerToWorkspace,
  isWikiWorkspaceWithRouting,
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
  wiki: {
    filterTiddlers: vi.fn(() => []),
    makeTiddlerIterator: vi.fn((titles: string[]) => titles),
  },
  rootWidget: {
    makeFakeWidgetWithVariables: vi.fn(() => ({})),
  },
};

describe('FileSystemAdaptor - Routing Logic', () => {
  let adaptor: FileSystemAdaptor;
  let mockWiki: Wiki;

  beforeEach(() => {
    vi.clearAllMocks();

    // @ts-expect-error - TiddlyWiki global
    global.$tw.boot.files = {};
    // @ts-expect-error - TiddlyWiki global
    global.$tw.boot.wikiTiddlersPath = '/test/wiki/tiddlers';

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

      const result = adaptor.getTiddlerFileInfo(tiddler);

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

      adaptor.getTiddlerFileInfo(tiddler);

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

      adaptor.getTiddlerFileInfo(tiddler);

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

      adaptor.getTiddlerFileInfo(tiddler);

      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          extFilters: ['.tid', '.json'],
        }),
      );
    });

    it('should return existing fileInfo with overwrite flag when file is in correct directory', async () => {
      const existingFileInfo: IFileInfo = {
        filepath: '/test/wiki/tiddlers/old.tid', // Already in the correct tiddlers directory
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = existingFileInfo;

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      const result = adaptor.getTiddlerFileInfo(tiddler);

      // Should return the existing fileInfo with overwrite flag, not call generateTiddlerFileInfo
      expect(result).toEqual({ ...existingFileInfo, overwrite: true });
      // Should NOT call generateTiddlerFileInfo since file is already in correct location
      expect(mockUtils.generateTiddlerFileInfo).not.toHaveBeenCalled();
    });

    it('should regenerate fileInfo when file is in wrong directory', async () => {
      const existingFileInfo: IFileInfo = {
        filepath: '/wrong/directory/old.tid', // In wrong directory
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      // @ts-expect-error - TiddlyWiki global
      global.$tw.boot.files['TestTiddler'] = existingFileInfo;

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: [] },
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should call generateTiddlerFileInfo since file needs to be moved
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalled();
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

      expect(() => adaptor.getTiddlerFileInfo(tiddler)).toThrow(
        'filesystem adaptor requires a valid wiki folder',
      );
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
        tagNames: ['SubWikiTag'],
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
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

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
        tagNames: ['Tag1'],
        wikiFolderLocation: '/test/wiki/sub1',
      };

      const subWiki2 = {
        id: 'sub-2',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: ['Tag2'],
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
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

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
        tagNames: ['SubWikiTag'],
        wikiFolderLocation: '/test/wiki/subwiki',
      };

      // Test scenario 2: Sub-wiki without tagNames
      const subWikiWithoutTag = {
        id: 'sub-wiki-2',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: [],
        wikiFolderLocation: '/test/wiki/subwiki2',
      };

      // Test scenario 3: Sub-wiki from different main wiki
      const otherMainWikiSubWiki = {
        id: 'sub-wiki-3',
        isSubWiki: true,
        mainWikiID: 'other-workspace',
        tagNames: ['AnotherTag'],
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
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

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

      const result = adaptor.getTiddlerFileInfo(tiddler);

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

      expect(adaptor['wikisWithRouting']).toEqual([]);
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

      expect(adaptor['wikisWithRouting']).toEqual([]);
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

  describe('getTiddlerFileInfo - Tag Tree Routing (includeTagTree)', () => {
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

    it('should route to sub-wiki when tiddler matches tag tree', async () => {
      const subWiki = {
        id: 'sub-wiki-tagtree',
        name: 'Sub Wiki TagTree',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: ['RootTag'],
        includeTagTree: true,
        wikiFolderLocation: '/test/wiki/subwiki/tagtree',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki] as IWikiWorkspace[]);

      // Mock filterTiddlers to return the tiddler when using in-tagtree-of filter
      // @ts-expect-error - TiddlyWiki global
      global.$tw.wiki.filterTiddlers = vi.fn(() => ['ChildTiddler']);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'ChildTiddler', tags: ['ParentTag'] }, // Not directly tagged with RootTag
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should use sub-wiki directory because tag tree matching found a match
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/subwiki/tagtree',
        }),
      );
    });

    it('should not match tag tree when includeTagTree is disabled', async () => {
      const subWiki = {
        id: 'sub-wiki-notree',
        name: 'Sub Wiki NoTree',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: ['RootTag'],
        includeTagTree: false, // Disabled
        wikiFolderLocation: '/test/wiki/subwiki/notree',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki] as IWikiWorkspace[]);

      // Even if filterTiddlers would return a match, it shouldn't be called
      // @ts-expect-error - TiddlyWiki global
      global.$tw.wiki.filterTiddlers = vi.fn(() => ['ChildTiddler']);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'ChildTiddler', tags: ['ParentTag'] }, // Not directly tagged with RootTag
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should use default directory because includeTagTree is disabled
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/tiddlers',
        }),
      );
    });
  });

  describe('getTiddlerFileInfo - Custom Filter Routing (fileSystemPathFilter)', () => {
    beforeEach(async () => {
      vi.mocked(workspace.get).mockResolvedValue(
        {
          id: 'test-workspace',
          name: 'Test Workspace',
          wikiFolderLocation: '/test/wiki',
        } as Parameters<typeof workspace.get>[0] extends Promise<infer T> ? T : never,
      );

      mockWiki = {
        getTiddlerText: vi.fn((title) => {
          if (title === '$:/info/tidgi/workspaceID') return 'test-workspace';
          return '';
        }),
        tiddlerExists: vi.fn(() => false),
        addTiddler: vi.fn(),
      } as unknown as Wiki;
    });

    it('should route to sub-wiki when tiddler matches custom filter', async () => {
      const subWiki = {
        id: 'sub-wiki-filter',
        name: 'Sub Wiki Filter',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: ['SomeTag'],
        fileSystemPathFilterEnable: true,
        fileSystemPathFilter: '[has[customfield]]',
        wikiFolderLocation: '/test/wiki/subwiki/filter',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki] as IWikiWorkspace[]);

      // Mock filterTiddlers to return the tiddler for custom filter
      // @ts-expect-error - TiddlyWiki global
      global.$tw.wiki.filterTiddlers = vi.fn((filter) => {
        if (filter === '[has[customfield]]') {
          return ['FilterMatchTiddler'];
        }
        return [];
      });

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'FilterMatchTiddler', tags: [] },
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should use sub-wiki directory because custom filter matched
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/subwiki/filter',
        }),
      );
    });

    it('should not match custom filter when fileSystemPathFilterEnable is disabled', async () => {
      const subWiki = {
        id: 'sub-wiki-filter-disabled',
        name: 'Sub Wiki Filter Disabled',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: ['SomeTag'],
        fileSystemPathFilterEnable: false, // Disabled
        fileSystemPathFilter: '[has[customfield]]',
        wikiFolderLocation: '/test/wiki/subwiki/filter-disabled',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki] as IWikiWorkspace[]);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'FilterMatchTiddler', tags: [] },
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should use default directory because filter is disabled
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/tiddlers',
        }),
      );
    });

    it('should support multiple filter lines (any match wins)', async () => {
      const subWiki = {
        id: 'sub-wiki-multifilter',
        name: 'Sub Wiki MultiFilter',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: [],
        fileSystemPathFilterEnable: true,
        fileSystemPathFilter: '[has[field1]]\n[has[field2]]',
        wikiFolderLocation: '/test/wiki/subwiki/multifilter',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki] as unknown as IWikiWorkspace[]);

      // Mock filterTiddlers to return match on second filter
      // @ts-expect-error - TiddlyWiki global
      global.$tw.wiki.filterTiddlers = vi.fn((filter) => {
        if (filter === '[has[field2]]') {
          return ['TiddlerWithField2'];
        }
        return [];
      });

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'TiddlerWithField2', tags: [] },
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should use sub-wiki directory because second filter line matched
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/subwiki/multifilter',
        }),
      );
    });
  });

  describe('getTiddlerFileInfo - Routing Priority', () => {
    beforeEach(async () => {
      vi.mocked(workspace.get).mockResolvedValue(
        {
          id: 'test-workspace',
          name: 'Test Workspace',
          wikiFolderLocation: '/test/wiki',
        } as Parameters<typeof workspace.get>[0] extends Promise<infer T> ? T : never,
      );

      mockWiki = {
        getTiddlerText: vi.fn((title) => {
          if (title === '$:/info/tidgi/workspaceID') return 'test-workspace';
          return '';
        }),
        tiddlerExists: vi.fn(() => false),
        addTiddler: vi.fn(),
      } as unknown as Wiki;
    });

    it('should prioritize direct tag match over tag tree match', async () => {
      const subWiki1 = {
        id: 'sub-wiki-direct',
        name: 'Sub Wiki Direct Tag',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        order: 0,
        tagNames: ['DirectTag'],
        includeTagTree: false,
        wikiFolderLocation: '/test/wiki/subwiki/direct',
      };

      const subWiki2 = {
        id: 'sub-wiki-tagtree',
        name: 'Sub Wiki TagTree',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        order: 1,
        tagNames: ['RootTag'],
        includeTagTree: true,
        wikiFolderLocation: '/test/wiki/subwiki/tagtree',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki1, subWiki2] as IWikiWorkspace[]);

      // Mock tag tree matching to return the tiddler
      // @ts-expect-error - TiddlyWiki global
      global.$tw.wiki.filterTiddlers = vi.fn(() => ['TestTiddler']);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      // Tiddler has both DirectTag (direct match) and would match RootTag via tag tree
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: ['DirectTag'] },
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should use direct tag sub-wiki (first match wins, and direct tag check happens before tag tree)
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/subwiki/direct',
        }),
      );
    });

    it('should prioritize tag match over custom filter match within same workspace', async () => {
      const subWiki = {
        id: 'sub-wiki-both',
        name: 'Sub Wiki Both',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        tagNames: ['MatchTag'],
        fileSystemPathFilterEnable: true,
        fileSystemPathFilter: '[has[customfield]]',
        wikiFolderLocation: '/test/wiki/subwiki/both',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki] as IWikiWorkspace[]);

      // Reset filterTiddlers mock
      // @ts-expect-error - TiddlyWiki global
      global.$tw.wiki.filterTiddlers = vi.fn(() => []);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      // Tiddler has the matching tag
      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: ['MatchTag'] },
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should match via tag (filter shouldn't even be checked for this tiddler)
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/subwiki/both',
        }),
      );
    });

    it('should check workspaces in order and use first match', async () => {
      const subWiki1 = {
        id: 'sub-wiki-first',
        name: 'Sub Wiki First',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        order: 0,
        tagNames: ['SharedTag'],
        wikiFolderLocation: '/test/wiki/subwiki/first',
      };

      const subWiki2 = {
        id: 'sub-wiki-second',
        name: 'Sub Wiki Second',
        isSubWiki: true,
        mainWikiID: 'test-workspace',
        order: 1,
        tagNames: ['SharedTag'], // Same tag
        wikiFolderLocation: '/test/wiki/subwiki/second',
      };

      vi.mocked(workspace.getWorkspacesAsList).mockResolvedValue([subWiki1, subWiki2] as IWikiWorkspace[]);

      adaptor = new FileSystemAdaptor({
        wiki: mockWiki,
        // @ts-expect-error - TiddlyWiki global
        boot: global.$tw.boot,
      });

      await adaptor['updateSubWikisCache']();

      const tiddler: Tiddler = {
        fields: { title: 'TestTiddler', tags: ['SharedTag'] },
      } as unknown as Tiddler;

      adaptor.getTiddlerFileInfo(tiddler);

      // Should use first sub-wiki (order 0)
      expect(mockUtils.generateTiddlerFileInfo).toHaveBeenCalledWith(
        tiddler,
        expect.objectContaining({
          directory: '/test/wiki/subwiki/first',
        }),
      );
    });
  });
});
