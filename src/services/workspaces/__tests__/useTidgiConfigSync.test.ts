import { SupportedStorageServices } from '@services/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../index';
import { isWikiWorkspace, type IWikiWorkspace, type IWorkspace, wikiWorkspaceDefaultValues } from '../interface';
import { syncableConfigFields } from '../syncableConfig';
import { WorkspaceType } from '../workspaceType';

// Mock registerMenu to avoid side effects
vi.mock('../registerMenu', () => ({
  registerMenu: vi.fn(),
}));

// Mock tidgi config utilities
const mockWriteTidgiConfig = vi.fn();
const mockReadTidgiConfig = vi.fn();
const mockReadTidgiConfigSync = vi.fn();
const mockExtractSyncableConfig = vi.fn();
const mockMergeWithSyncedConfig = vi.fn();

vi.mock('../../database/configSetting', () => ({
  writeTidgiConfig: (...args: unknown[]) => mockWriteTidgiConfig(...args) as Promise<void>,
  readTidgiConfig: (...args: unknown[]) => mockReadTidgiConfig(...args) as Promise<Record<string, unknown> | undefined>,
  readTidgiConfigSync: (...args: unknown[]) => mockReadTidgiConfigSync(...args) as Record<string, unknown> | undefined,
  extractSyncableConfig: (...args: unknown[]) => mockExtractSyncableConfig(...args) as Record<string, unknown>,
  mergeWithSyncedConfig: (...args: unknown[]) => mockMergeWithSyncedConfig(...args) as Record<string, unknown>,
  getTidgiConfigPath: (wikiFolderLocation: string) => `${wikiFolderLocation}/tidgi.config.json`,
  hasTidgiConfig: vi.fn(),
  initTidgiConfigLogger: vi.fn(),
  TIDGI_CONFIG_FILE: 'tidgi.config.json',
  TIDGI_CONFIG_VERSION: 1,
}));

// Mock container to control database service and avoid missing bindings
const mockGetSetting = vi.fn();
const mockSetSetting = vi.fn();
const mockImmediatelyStoreSettingsToFile = vi.fn();

vi.mock('@services/container', async () => {
  const actual = await vi.importActual<typeof import('@services/container')>('@services/container');
  return Object.assign({}, actual, {
    container: Object.assign(Object.create(Object.getPrototypeOf(actual.container)), actual.container, {
      get: vi.fn((identifier: symbol) => {
        const description = identifier.toString();
        if (description.includes('Database')) {
          return {
            getSetting: mockGetSetting,
            setSetting: mockSetSetting,
            immediatelyStoreSettingsToFile: mockImmediatelyStoreSettingsToFile,
          };
        }
        if (description.includes('MenuService')) {
          return {
            buildMenu: vi.fn().mockResolvedValue(undefined),
            insertMenu: vi.fn().mockResolvedValue(undefined),
          };
        }
        if (description.includes('Authentication')) {
          return {
            generateOneTimeAdminAuthTokenForWorkspaceSync: vi.fn().mockReturnValue('mock-token'),
          };
        }
        if (description.includes('WorkspaceView')) {
          return {
            setActiveWorkspaceView: vi.fn().mockResolvedValue(undefined),
          };
        }
        if (description.includes('Analytics')) {
          return {
            track: vi.fn().mockResolvedValue(undefined),
            identify: vi.fn().mockResolvedValue(undefined),
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return actual.container.get(identifier);
      }),
    }),
  });
});

function createWorkspace(overrides: Partial<IWikiWorkspace>): IWikiWorkspace {
  const id = overrides.id ?? 'workspace-1';
  return {
    ...wikiWorkspaceDefaultValues,
    id,
    name: 'Workspace 1',
    wikiFolderLocation: '/tmp/workspace-1',
    isSubWiki: false,
    mainWikiID: null,
    pageType: null,
    picturePath: null,
    homeUrl: `tidgi://${id}`,
    gitUrl: null,
    storageService: SupportedStorageServices.local,
    tagNames: [],
    userName: 'tester',
    ...overrides,
  };
}

class TestableWorkspace extends Workspace {
  constructor(workspace?: IWikiWorkspace) {
    super();
    if (workspace !== undefined) {
      this.workspaces = { [workspace.id]: workspace };
    }
  }

  public sanitizeWorkspaceForTest(workspace: IWorkspace, hydratePortableConfig = false): IWorkspace {
    return this.sanitizeWorkspace(workspace, hydratePortableConfig);
  }
}

function createWorkspaceService(workspace: IWikiWorkspace): Workspace {
  return new TestableWorkspace(workspace);
}

describe('Workspace useTidgiConfigSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSetting.mockReturnValue({});
    mockReadTidgiConfig.mockResolvedValue(undefined);
    mockReadTidgiConfigSync.mockReturnValue(undefined);
    mockWriteTidgiConfig.mockResolvedValue(undefined);
    mockExtractSyncableConfig.mockImplementation((workspace: IWikiWorkspace) => ({
      id: workspace.id,
      name: workspace.name,
      readOnlyMode: workspace.readOnlyMode,
      enableFileSystemWatch: workspace.enableFileSystemWatch,
    }));
    mockMergeWithSyncedConfig.mockImplementation((local: IWikiWorkspace, synced: Partial<IWikiWorkspace> | undefined) => {
      const merged = { ...local };
      if (synced !== undefined) {
        for (const field of syncableConfigFields) {
          if (field in synced) Object.assign(merged, { [field]: synced[field] });
        }
      }
      return merged;
    });
  });

  describe('create', () => {
    it('should set useTidgiConfigSync to true by default when creating workspace', async () => {
      const service = new Workspace();
      mockGetSetting.mockReturnValue({});

      const newWorkspace = await service.create({
        name: 'Test Wiki',
        wikiFolderLocation: '/tmp/test-wiki',
        isSubWiki: false,
        mainWikiID: null,
        tagNames: [],
        port: 5212,
        storageService: SupportedStorageServices.local,
        workspaceType: WorkspaceType.folder,
        readOnlyMode: false,
        tokenAuth: false,
        enableFileSystemWatch: false,
        gitUrl: null,
      });

      expect((newWorkspace as IWikiWorkspace).useTidgiConfigSync).toBe(true);
    });

    it('should set useTidgiConfigSync to false when useTidgiConfig is false', async () => {
      const service = new Workspace();
      mockGetSetting.mockReturnValue({});

      const newWorkspace = await service.create({
        name: 'Test Wiki',
        wikiFolderLocation: '/tmp/test-wiki',
        isSubWiki: false,
        mainWikiID: null,
        tagNames: [],
        port: 5212,
        storageService: SupportedStorageServices.local,
        workspaceType: WorkspaceType.folder,
        readOnlyMode: false,
        tokenAuth: false,
        enableFileSystemWatch: false,
        gitUrl: null,
        useTidgiConfig: false,
      });

      expect((newWorkspace as IWikiWorkspace).useTidgiConfigSync).toBe(false);
    });
  });

  describe('set', () => {
    it('writes the portable config and keeps settings.json self-contained when sync is enabled', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: true });
      const service = createWorkspaceService(workspace);

      await service.set(workspace.id, { ...workspace, name: 'Updated Name' });

      expect(mockWriteTidgiConfig).toHaveBeenCalledWith(workspace.wikiFolderLocation, expect.any(Object));
      expect(mockReadTidgiConfigSync).not.toHaveBeenCalled();
      const savedWorkspace = mockSetSetting.mock.calls[0][1][workspace.id] as IWikiWorkspace;
      expect(savedWorkspace).toMatchObject({
        name: 'Updated Name',
        readOnlyMode: workspace.readOnlyMode,
        useTidgiConfigSync: true,
      });
    });

    it('should NOT write tidgi.config.json and should keep syncable fields in settings.json when useTidgiConfigSync is false', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: false, readOnlyMode: true });
      const service = createWorkspaceService(workspace);

      mockReadTidgiConfigSync.mockReturnValue({ version: 1, name: 'Workspace 1' });

      await service.set(workspace.id, { ...workspace, name: 'Updated Name' });

      expect(mockWriteTidgiConfig).not.toHaveBeenCalled();
      // Verify settings.json receives the full workspace including syncable fields
      const setSettingCall = mockSetSetting.mock.calls[0];
      expect(setSettingCall[0]).toBe('workspaces');
      const savedWorkspace = setSettingCall[1][workspace.id] as IWikiWorkspace;
      expect(savedWorkspace.name).toBe('Updated Name');
      expect(savedWorkspace.readOnlyMode).toBe(true);
    });

    it('should NOT write tidgi.config.json even when syncable fields changed if useTidgiConfigSync is false', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: false });
      const service = createWorkspaceService(workspace);

      mockReadTidgiConfigSync.mockReturnValue(undefined);

      const updatedWorkspace = { ...workspace, readOnlyMode: true, name: 'Changed Name' };
      await service.set(workspace.id, updatedWorkspace);

      expect(mockWriteTidgiConfig).not.toHaveBeenCalled();
    });

    it('serializes concurrent partial updates so neither update is lost', async () => {
      const workspace = createWorkspace({
        useTidgiConfigSync: true,
        readOnlyMode: false,
        enableFileSystemWatch: false,
      });
      const service = createWorkspaceService(workspace);
      mockReadTidgiConfigSync.mockReturnValue({ version: 1, name: 'Workspace 1' });

      let finishFirstWrite: (() => void) | undefined;
      mockWriteTidgiConfig
        .mockImplementationOnce(() =>
          new Promise<void>((resolve) => {
            finishFirstWrite = resolve;
          })
        )
        .mockResolvedValue(undefined);

      const firstUpdate = service.update(workspace.id, { enableFileSystemWatch: true });
      const secondUpdate = service.update(workspace.id, { readOnlyMode: true });

      await vi.waitFor(() => {
        expect(mockWriteTidgiConfig).toHaveBeenCalledTimes(1);
      });
      expect(finishFirstWrite).toBeDefined();
      finishFirstWrite?.();
      await Promise.all([firstUpdate, secondUpdate]);

      await expect(service.get(workspace.id)).resolves.toMatchObject({
        enableFileSystemWatch: true,
        readOnlyMode: true,
      });
      expect(mockWriteTidgiConfig).toHaveBeenLastCalledWith(
        workspace.wikiFolderLocation,
        expect.objectContaining({
          enableFileSystemWatch: true,
          readOnlyMode: true,
        }),
      );
    });

    it('merges runtime updates into the raw persisted shape without writing sanitized defaults', async () => {
      const workspace = createWorkspace({ hibernated: false, useTidgiConfigSync: true });
      const service = createWorkspaceService(workspace);
      const rawWorkspace = {
        id: workspace.id,
        wikiFolderLocation: workspace.wikiFolderLocation,
        futureField: 'preserve-me',
      };
      mockGetSetting.mockReturnValue({ [workspace.id]: rawWorkspace });

      await service.update(workspace.id, { hibernated: true });

      const persisted = mockSetSetting.mock.calls[0][1][workspace.id] as Record<string, unknown>;
      expect(persisted).toEqual({ ...rawWorkspace, hibernated: true });
      expect(persisted).not.toHaveProperty('name');
      expect(persisted).not.toHaveProperty('useTidgiConfigSync');
    });
  });

  describe('sanitizeWorkspace', () => {
    it('hydrates portable workspace fields from tidgi.config.json during startup', async () => {
      const workspace = createWorkspace({
        useTidgiConfigSync: true,
        name: 'Local Name',
        isSubWiki: false,
        mainWikiID: null,
      });
      const service = new Workspace();
      mockGetSetting.mockReturnValue({ [workspace.id]: workspace });
      mockReadTidgiConfigSync.mockReturnValue({
        name: 'Portable Name',
        tagNames: [],
        isSubWiki: true,
        mainWikiID: 'root',
      });

      const result = await service.getWorkspaces();

      expect(mockReadTidgiConfigSync).toHaveBeenCalledWith(workspace.wikiFolderLocation);
      expect(mockReadTidgiConfig).not.toHaveBeenCalled();
      expect(result[workspace.id]).toMatchObject({
        id: workspace.id,
        homeUrl: `tidgi://${workspace.id}`,
        lastUrl: null,
        name: 'Portable Name',
        isSubWiki: true,
        mainWikiID: null,
      });
    });

    it('uses portable subwiki metadata to resolve the hierarchy after every workspace is hydrated', async () => {
      const root = createWorkspace({
        id: 'root',
        name: '',
        wikiFolderLocation: '/wikis/root',
        useTidgiConfigSync: true,
      });
      const sub = createWorkspace({
        id: 'sub',
        name: '',
        wikiFolderLocation: '/wikis/sub',
        useTidgiConfigSync: true,
      });
      mockGetSetting.mockReturnValue({ root, sub });
      mockReadTidgiConfigSync.mockImplementation((workspacePath: string) =>
        workspacePath === root.wikiFolderLocation
          ? { name: 'Root Wiki' }
          : {
            name: 'Sub Wiki',
            isSubWiki: true,
            mainWikiID: root.id,
          }
      );

      const result = await new Workspace().getWorkspaces();

      expect(result.root).toMatchObject({ name: 'Root Wiki', isSubWiki: false });
      expect(result.sub).toMatchObject({
        name: 'Sub Wiki',
        isSubWiki: true,
        mainWikiID: root.id,
      });
    });

    it('sanitizes canonical html workspaces without reading tidgi.config.json', async () => {
      const workspace = createWorkspace({
        workspaceType: WorkspaceType.html,
        htmlFileLocation: '/tmp/demo.html',
        wikiFolderLocation: '/tmp',
        useTidgiConfigSync: true,
      });
      const service = new TestableWorkspace(workspace);

      const result = service.sanitizeWorkspaceForTest(workspace);

      expect(mockReadTidgiConfigSync).not.toHaveBeenCalled();
      if (!isWikiWorkspace(result)) {
        throw new Error('expected HTML workspace to retain wiki workspace shape');
      }
      expect(result.workspaceType).toBe(WorkspaceType.html);
      expect(result.useTidgiConfigSync).toBe(false);
    });

    it('rejects a workspace without its canonical workspace type', () => {
      const workspace = createWorkspace({});
      Reflect.deleteProperty(workspace, 'workspaceType');
      const service = new TestableWorkspace();

      expect(() => service.sanitizeWorkspaceForTest(workspace)).toThrow('workspace_invalid_workspace_type');
    });

    it.each([
      ['missing name', { name: '' }],
      ['missing tagNames', { tagNames: undefined }],
      ['legacy HTTP homeUrl', { homeUrl: 'http://localhost:5212/' }],
      ['legacy HTTP lastUrl', { lastUrl: 'http://localhost:5212/' }],
    ])('rejects canonical workspace input with %s', (_description, overrides) => {
      const workspace = createWorkspace(overrides);
      const service = new TestableWorkspace();

      expect(() => service.sanitizeWorkspaceForTest(workspace)).toThrow('workspace_invalid_canonical_fields');
    });

    it('rejects the retired tagName alias through the public startup path', async () => {
      const workspace = createWorkspace({});
      Reflect.deleteProperty(workspace, 'tagNames');
      Object.assign(workspace, { tagName: 'Legacy' });
      mockGetSetting.mockReturnValue({ [workspace.id]: workspace });

      await expect(new Workspace().getWorkspaces()).resolves.toEqual({});
      expect(mockSetSetting).not.toHaveBeenCalled();
    });

    it('does not resolve workspace IDs through a case-insensitive alias', async () => {
      const workspace = createWorkspace({ id: 'Workspace-Case' });
      const service = createWorkspaceService(workspace);

      await expect(service.get('workspace-case')).resolves.toBeUndefined();
    });

    it('does not synthesize a missing name from the folder path during startup', async () => {
      const workspace = createWorkspace({ name: '' });
      Reflect.deleteProperty(workspace, 'name');
      mockGetSetting.mockReturnValue({ [workspace.id]: workspace });

      const result = await new Workspace().getWorkspaces();

      expect(result).toEqual({});
      expect(mockSetSetting).not.toHaveBeenCalled();
    });

    it('rejects a stale home URL instead of rewriting it to the current workspace ID', async () => {
      const workspace = createWorkspace({ id: 'workspace-new', homeUrl: 'tidgi://workspace-old' });
      mockGetSetting.mockReturnValue({ [workspace.id]: workspace });

      const result = await new Workspace().getWorkspaces();

      expect(result).toEqual({});
      expect(mockSetSetting).not.toHaveBeenCalled();
    });

    it('initializes 26 canonical entries without recursion and resolves hierarchy in a second pass', async () => {
      const root = createWorkspace({ id: 'root-new', wikiFolderLocation: '/wikis/root' });
      const missingMainID = createWorkspace({
        id: 'sub-missing-id',
        isSubWiki: true,
        mainWikiID: null,
        wikiFolderLocation: '/wikis/root/sub',
      });
      const remapped = createWorkspace({
        id: 'sub-remapped',
        isSubWiki: true,
        mainWikiID: root.id,
        wikiFolderLocation: '/wikis/root/remapped',
      });
      const cycleA = createWorkspace({ id: 'cycle-a', isSubWiki: true, mainWikiID: 'cycle-b' });
      const cycleB = createWorkspace({ id: 'cycle-b', isSubWiki: true, mainWikiID: 'cycle-a' });
      const ambiguousRootA = createWorkspace({ id: 'ambiguous-a', wikiFolderLocation: '/wikis/duplicate' });
      const ambiguousRootB = createWorkspace({ id: 'ambiguous-b', wikiFolderLocation: '/wikis/duplicate' });
      const ambiguousSub = createWorkspace({
        id: 'ambiguous-sub',
        isSubWiki: true,
        mainWikiID: null,
      });
      const settings: Record<string, IWikiWorkspace> = {
        [root.id]: root,
        [missingMainID.id]: missingMainID,
        [remapped.id]: remapped,
        [cycleA.id]: cycleA,
        [cycleB.id]: cycleB,
        [ambiguousRootA.id]: ambiguousRootA,
        [ambiguousRootB.id]: ambiguousRootB,
        [ambiguousSub.id]: ambiguousSub,
      };
      for (let index = Object.keys(settings).length; index < 26; index++) {
        const workspace = createWorkspace({ id: `regular-${index}`, wikiFolderLocation: `/wikis/regular-${index}` });
        settings[workspace.id] = workspace;
      }
      mockGetSetting.mockReturnValue(settings);

      const result = await new Workspace().getWorkspaces();

      expect(Object.keys(result)).toHaveLength(26);
      expect((result[missingMainID.id] as IWikiWorkspace).mainWikiID).toBeNull();
      expect((result[remapped.id] as IWikiWorkspace).mainWikiID).toBe(root.id);
      expect((result[cycleA.id] as IWikiWorkspace).mainWikiID).toBeNull();
      expect((result[cycleB.id] as IWikiWorkspace).mainWikiID).toBeNull();
      expect((result[ambiguousSub.id] as IWikiWorkspace).mainWikiID).toBeNull();
      expect(mockReadTidgiConfigSync).toHaveBeenCalledTimes(26);
      expect(mockSetSetting).not.toHaveBeenCalled();
    });

    it('isolates malformed and mismatched-id settings entries without writing them back', async () => {
      const first = createWorkspace({ id: 'same-id', wikiFolderLocation: '/wikis/first' });
      const duplicate = createWorkspace({ id: 'same-id', wikiFolderLocation: '/wikis/second' });
      mockGetSetting.mockReturnValue({ 'same-id': first, duplicate, invalid: null });

      const result = await new Workspace().getWorkspaces();

      expect(Object.keys(result)).toEqual(['same-id']);
      expect((result['same-id'] as IWikiWorkspace).wikiFolderLocation).toBe('/wikis/first');
      expect(mockSetSetting).not.toHaveBeenCalled();
    });
  });
});
