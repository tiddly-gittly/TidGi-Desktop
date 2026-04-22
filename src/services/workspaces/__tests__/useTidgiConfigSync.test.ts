import { SupportedStorageServices } from '@services/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../index';
import { type IWikiWorkspace, wikiWorkspaceDefaultValues } from '../interface';

// Mock registerMenu to avoid side effects
vi.mock('../registerMenu', () => ({
  registerMenu: vi.fn(),
}));

// Mock tidgi config utilities
const mockWriteTidgiConfig = vi.fn();
const mockReadTidgiConfig = vi.fn();
const mockReadTidgiConfigSync = vi.fn();
const mockExtractSyncableConfig = vi.fn();
const mockRemoveSyncableFields = vi.fn();

vi.mock('../../database/configSetting', () => ({
  writeTidgiConfig: (...args: unknown[]) => mockWriteTidgiConfig(...args) as Promise<void>,
  readTidgiConfig: (...args: unknown[]) => mockReadTidgiConfig(...args) as Promise<Record<string, unknown> | undefined>,
  readTidgiConfigSync: (...args: unknown[]) => mockReadTidgiConfigSync(...args) as Record<string, unknown> | undefined,
  extractSyncableConfig: (...args: unknown[]) => mockExtractSyncableConfig(...args) as Record<string, unknown>,
  removeSyncableFields: (...args: unknown[]) => mockRemoveSyncableFields(...args) as Record<string, unknown>,
  mergeWithSyncedConfig: (local: unknown, synced: unknown) => ({ ...(local as object), ...(synced as object) }),
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return actual.container.get(identifier);
      }),
    }),
  });
});

function createWorkspace(overrides: Partial<IWikiWorkspace>): IWikiWorkspace {
  return {
    ...wikiWorkspaceDefaultValues,
    id: 'workspace-1',
    name: 'Workspace 1',
    wikiFolderLocation: '/tmp/workspace-1',
    isSubWiki: false,
    mainWikiID: null,
    mainWikiToLink: null,
    pageType: null,
    picturePath: null,
    homeUrl: 'tidgi://workspace-1',
    gitUrl: null,
    storageService: SupportedStorageServices.local,
    tagNames: [],
    userName: 'tester',
    ...overrides,
  };
}

function createWorkspaceService(workspace: IWikiWorkspace): Workspace {
  const service = new Workspace();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (service as any).workspaces = { [workspace.id]: workspace };
  return service;
}

describe('Workspace useTidgiConfigSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSetting.mockReturnValue({});
    mockWriteTidgiConfig.mockResolvedValue(undefined);
    mockExtractSyncableConfig.mockImplementation((workspace: IWikiWorkspace) => ({
      id: workspace.id,
      name: workspace.name,
      readOnlyMode: workspace.readOnlyMode,
    }));
    mockRemoveSyncableFields.mockImplementation((workspace: IWikiWorkspace) => {
      const { name, readOnlyMode, ...rest } = workspace as unknown as Record<string, unknown>;
      void name;
      void readOnlyMode;
      return rest;
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
        mainWikiToLink: null,
        mainWikiID: null,
        tagNames: [],
        port: 5212,
        storageService: SupportedStorageServices.local,
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
        mainWikiToLink: null,
        mainWikiID: null,
        tagNames: [],
        port: 5212,
        storageService: SupportedStorageServices.local,
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
    it('should write tidgi.config.json and strip syncable fields from settings.json when useTidgiConfigSync is true and tidgi.config.json exists', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: true });
      const service = createWorkspaceService(workspace);

      mockReadTidgiConfigSync.mockReturnValue({ version: 1, name: 'Workspace 1' });

      await service.set(workspace.id, { ...workspace, name: 'Updated Name' });

      expect(mockWriteTidgiConfig).toHaveBeenCalledWith(workspace.wikiFolderLocation, expect.any(Object));
      expect(mockRemoveSyncableFields).toHaveBeenCalled();
      expect(mockSetSetting).toHaveBeenCalledWith('workspaces', expect.any(Object));
    });

    it('should NOT write tidgi.config.json and should keep syncable fields in settings.json when useTidgiConfigSync is false', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: false, readOnlyMode: true });
      const service = createWorkspaceService(workspace);

      mockReadTidgiConfigSync.mockReturnValue({ version: 1, name: 'Workspace 1' });

      await service.set(workspace.id, { ...workspace, name: 'Updated Name' });

      expect(mockWriteTidgiConfig).not.toHaveBeenCalled();
      expect(mockRemoveSyncableFields).not.toHaveBeenCalled();
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
  });

  describe('sanitizeWorkspace', () => {
    it('should read tidgi.config.json during initial load when useTidgiConfigSync is true', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: true });
      const service = createWorkspaceService(workspace);

      mockReadTidgiConfigSync.mockReturnValue({ version: 1, name: 'Synced Name' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (service as any).sanitizeWorkspace(workspace, true);

      expect(mockReadTidgiConfigSync).toHaveBeenCalledWith(workspace.wikiFolderLocation);
      expect(result.name).toBe('Synced Name');
    });

    it('should NOT read tidgi.config.json during initial load when useTidgiConfigSync is false', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: false, name: 'Local Name' });
      const service = createWorkspaceService(workspace);

      mockReadTidgiConfigSync.mockReturnValue({ version: 1, name: 'Synced Name' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (service as any).sanitizeWorkspace(workspace, true);

      expect(mockReadTidgiConfigSync).not.toHaveBeenCalled();
      expect(result.name).toBe('Local Name');
    });

    it('should not read tidgi.config.json during runtime updates regardless of useTidgiConfigSync', async () => {
      const workspace = createWorkspace({ useTidgiConfigSync: true });
      const service = createWorkspaceService(workspace);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).sanitizeWorkspace(workspace, false);

      expect(mockReadTidgiConfigSync).not.toHaveBeenCalled();
    });
  });
});
