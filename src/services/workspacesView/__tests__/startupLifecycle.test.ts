import { PageType } from '@/constants/pageTypes';
import { SupportedStorageServices } from '@services/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type IDedicatedWorkspace, type IWikiWorkspace, wikiWorkspaceDefaultValues } from '../../workspaces/interface';

const mocks = vi.hoisted(() => ({
  getWorkspacesAsList: vi.fn(),
  setAllWikiStartLockOff: vi.fn(),
  setWikiStartLockOn: vi.fn(),
  updateMetaData: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  getActiveWorkspace: vi.fn(),
  get: vi.fn(),
  getView: vi.fn(),
  addView: vi.fn().mockResolvedValue(undefined),
  showView: vi.fn().mockResolvedValue(undefined),
  buildMenu: vi.fn().mockResolvedValue(undefined),
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
            update: mocks.update,
            getActiveWorkspace: mocks.getActiveWorkspace,
            get: mocks.get,
          };
        }
        if (description === 'Symbol(View)') return { getView: mocks.getView, addView: mocks.addView, showView: mocks.showView };
        if (description === 'Symbol(MenuService)') return { buildMenu: mocks.buildMenu };
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
    { get: vi.fn().mockResolvedValue(false) } as never,
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

  it.each([PageType.agent, PageType.help, PageType.guide, PageType.add])('does not overlay a wiki view when the window is shown on the %s page', async (pageType) => {
    const workspace = { id: pageType, name: pageType, pageType, active: true, order: 0, picturePath: null } satisfies IDedicatedWorkspace;
    mocks.getActiveWorkspace.mockResolvedValue(workspace);
    mocks.get.mockResolvedValue(workspace);

    await expect(createService().refreshActiveWorkspaceView()).resolves.toBeUndefined();

    expect(mocks.addView).not.toHaveBeenCalled();
    expect(mocks.showView).not.toHaveBeenCalled();
    expect(mocks.buildMenu).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('still restores a real wiki when a view already exists: %s', async (existing) => {
    const workspace = createWorkspace('wiki', { active: true });
    mocks.getActiveWorkspace.mockResolvedValue(workspace);
    mocks.get.mockResolvedValue(workspace);
    mocks.getView.mockReturnValueOnce(existing ? {} : undefined);

    await createService().refreshActiveWorkspaceView();

    if (existing) {
      expect(mocks.showView).toHaveBeenCalledWith('wiki', 'main');
      expect(mocks.addView).not.toHaveBeenCalled();
    } else {
      expect(mocks.addView).toHaveBeenCalledWith(workspace, 'main');
      expect(mocks.showView).not.toHaveBeenCalled();
    }
    expect(mocks.buildMenu).toHaveBeenCalledTimes(1);
  });

  it('keeps a navigation persistence failure from rejecting an Electron event listener', async () => {
    const service = createService();
    mocks.update.mockRejectedValueOnce(new Error('settings write failed'));
    const view = {
      webContents: { getURL: () => 'tidgi://workspace/#:Index', isDestroyed: () => false },
    };

    await expect(service.updateLastUrl('workspace', view as never)).resolves.toBeUndefined();
    expect(mocks.update).toHaveBeenCalledWith('workspace', { lastUrl: 'tidgi://workspace/#:Index' });
  });

  it('ignores navigation callbacks for an already destroyed view', async () => {
    const service = createService();
    const getURL = vi.fn();
    await service.updateLastUrl('workspace', { webContents: { getURL, isDestroyed: () => true } } as never);
    expect(getURL).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
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
