import { SupportedStorageServices } from '@services/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type IWikiWorkspace, wikiWorkspaceDefaultValues } from '../../workspaces/interface';

const mocks = vi.hoisted(() => ({
  getWorkspacesAsList: vi.fn(),
  setAllWikiStartLockOff: vi.fn(),
  setWikiStartLockOn: vi.fn(),
  updateMetaData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => process.cwd()) },
  dialog: { showMessageBox: vi.fn() },
  session: {},
}));

vi.mock('../registerMenu', () => ({ registerMenu: vi.fn() }));

vi.mock('@services/container', async () => {
  const actual = await vi.importActual<typeof import('@services/container')>('@services/container');
  return Object.assign({}, actual, {
    container: Object.assign(Object.create(Object.getPrototypeOf(actual.container)), actual.container, {
      get: vi.fn((identifier: symbol) => {
        const description = identifier.toString();
        if (description.includes('Workspace') && !description.includes('WorkspaceView')) {
          return {
            getWorkspacesAsList: mocks.getWorkspacesAsList,
            updateMetaData: mocks.updateMetaData,
          };
        }
        if (description.includes('Symbol(Wiki)')) {
          return {
            setAllWikiStartLockOff: mocks.setAllWikiStartLockOff,
            setWikiStartLockOn: mocks.setWikiStartLockOn,
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return actual.container.get(identifier);
      }),
    }),
  });
});

import { WORKSPACE_STARTUP_CONCURRENCY, WorkspaceView } from '..';
import { registerMenu } from '../registerMenu';

function createWorkspace(id: string, overrides: Partial<IWikiWorkspace> = {}): IWikiWorkspace {
  return {
    ...wikiWorkspaceDefaultValues,
    id,
    name: id,
    wikiFolderLocation: `/wikis/${id}`,
    homeUrl: `tidgi://${id}`,
    storageService: SupportedStorageServices.local,
    ...overrides,
  };
}

function createService(): WorkspaceView {
  return new WorkspaceView(
    {} as never,
    {} as never,
  );
}

describe('WorkspaceView startup lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not schedule Electron menu work merely by constructing the service', async () => {
    vi.useFakeTimers();
    try {
      const service = createService();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(registerMenu).not.toHaveBeenCalled();

      await service.initializeMenu();
      expect(registerMenu).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails duplicate folder and HTTP-port resources before starting workers', async () => {
    const workspaces = [
      createWorkspace('primary', { active: true, enableHTTPAPI: true, port: 5212, wikiFolderLocation: '/wikis/shared' }),
      createWorkspace('duplicate-folder', { enableHTTPAPI: true, port: 5213, wikiFolderLocation: '/wikis/shared' }),
      createWorkspace('duplicate-port', { enableHTTPAPI: true, port: 5212, wikiFolderLocation: '/wikis/other' }),
      createWorkspace('independent', { enableHTTPAPI: true, port: 5214 }),
    ];
    mocks.getWorkspacesAsList.mockResolvedValue(workspaces);
    const service = createService();
    const initialize = vi.spyOn(service, 'initializeWorkspaceView').mockResolvedValue(undefined);

    await service.initializeAllWorkspaceView();

    expect(initialize.mock.calls.map(([workspace]) => workspace.id).sort()).toEqual(['independent', 'primary']);
    expect(mocks.updateMetaData).toHaveBeenCalledWith('duplicate-folder', expect.objectContaining({ didFailLoadErrorMessage: expect.stringContaining('folder') }));
    expect(mocks.updateMetaData).toHaveBeenCalledWith('duplicate-port', expect.objectContaining({ didFailLoadErrorMessage: expect.stringContaining('port') }));
    expect(mocks.setAllWikiStartLockOff).toHaveBeenCalledTimes(1);
  });

  it('records an individual worker failure and continues the startup batch', async () => {
    const workspaces = [createWorkspace('broken'), createWorkspace('healthy')];
    mocks.getWorkspacesAsList.mockResolvedValue(workspaces);
    const service = createService();
    const initialize = vi.spyOn(service, 'initializeWorkspaceView').mockImplementation(async (workspace) => {
      if (workspace.id === 'broken') throw new Error('worker startup timed out');
    });

    await expect(service.initializeAllWorkspaceView()).resolves.toBeUndefined();

    expect(initialize.mock.calls.map(([workspace]) => workspace.id).sort()).toEqual(['broken', 'healthy']);
    expect(mocks.updateMetaData).toHaveBeenCalledWith('broken', {
      isLoading: false,
      didFailLoadErrorMessage: 'worker startup timed out',
    });
    expect(mocks.setAllWikiStartLockOff).toHaveBeenCalledTimes(1);
  });

  it('continues startup when recording an individual worker failure also fails', async () => {
    const workspaces = [createWorkspace('broken'), createWorkspace('healthy')];
    mocks.getWorkspacesAsList.mockResolvedValue(workspaces);
    mocks.updateMetaData.mockRejectedValueOnce(new Error('settings unavailable'));
    const service = createService();
    const initialize = vi.spyOn(service, 'initializeWorkspaceView').mockImplementation(async (workspace) => {
      if (workspace.id === 'broken') throw new Error('worker startup timed out');
    });

    await expect(service.initializeAllWorkspaceView()).resolves.toBeUndefined();

    expect(initialize.mock.calls.map(([workspace]) => workspace.id).sort()).toEqual(['broken', 'healthy']);
    expect(mocks.updateMetaData).toHaveBeenCalledWith(
      'broken',
      expect.objectContaining({
        didFailLoadErrorMessage: 'worker startup timed out',
      }),
    );
    expect(mocks.setAllWikiStartLockOff).toHaveBeenCalledTimes(1);
  });

  it('bounds concurrency and cancellation prevents queued work from starting', async () => {
    const workspaces = Array.from({ length: 8 }, (_, index) => createWorkspace(`workspace-${index}`));
    mocks.getWorkspacesAsList.mockResolvedValue(workspaces);
    const service = createService();
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const initialize = vi.spyOn(service, 'initializeWorkspaceView').mockImplementation(async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
    });

    const startup = service.initializeAllWorkspaceView();
    await vi.waitFor(() => {
      expect(initialize).toHaveBeenCalledTimes(WORKSPACE_STARTUP_CONCURRENCY);
    });
    service.cancelWorkspaceStartup();
    releases.splice(0).forEach(resolve => {
      resolve();
    });
    await expect(startup).rejects.toThrow('Workspace startup cancelled because the application is quitting');

    expect(maximumActive).toBe(WORKSPACE_STARTUP_CONCURRENCY);
    expect(initialize).toHaveBeenCalledTimes(WORKSPACE_STARTUP_CONCURRENCY);
    expect(mocks.setAllWikiStartLockOff).toHaveBeenCalledTimes(1);
  });

  it('propagates cancellation instead of recording it as a failed workspace', async () => {
    const workspace = createWorkspace('cancelled');
    mocks.getWorkspacesAsList.mockResolvedValue([workspace]);
    const service = createService();
    let rejectStartup: ((error: Error) => void) | undefined;
    vi.spyOn(service, 'initializeWorkspaceView').mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectStartup = reject;
        }),
    );

    const startup = service.initializeAllWorkspaceView();
    await vi.waitFor(() => {
      expect(rejectStartup).toBeDefined();
    });
    service.cancelWorkspaceStartup();
    rejectStartup?.(new Error('worker was stopped during shutdown'));

    await expect(startup).rejects.toThrow('Workspace startup cancelled because the application is quitting');
    expect(mocks.updateMetaData).not.toHaveBeenCalled();
    expect(mocks.setAllWikiStartLockOff).toHaveBeenCalledTimes(1);
  });
});
