import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { WorkspaceType } from '@services/workspaces/workspaceType';
import type { BrowserWindow, WebContentsView } from 'electron';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { View } from '../index';
import setupViewEventHandlers from '../setupViewEventHandlers';

vi.mock('../setupViewFileProtocol', () => ({ handleViewFileContentLoading: vi.fn() }));
vi.mock('lodash', async importOriginal => ({
  ...await importOriginal<typeof import('lodash')>(),
  throttle: () => vi.fn(),
}));

const workspace = {
  ...wikiWorkspaceDefaultValues,
  id: 'wiki',
  name: 'wiki',
  homeUrl: 'tidgi://wiki',
  lastUrl: 'tidgi://wiki#saved',
  wikiFolderLocation: '/tmp/wiki',
  workspaceType: WorkspaceType.folder,
};

function fixture() {
  const contents = Object.assign(new EventEmitter(), {
    getURL: vi.fn(() => 'tidgi://wiki#saved'),
    isDestroyed: vi.fn(() => false),
    isLoadingMainFrame: vi.fn(() => false),
    getOSProcessId: vi.fn(() => 1),
    loadURL: vi.fn(async (_url: string) => {}),
    executeJavaScript: vi.fn(async (_code: string) => {}),
    reload: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    session: { on: vi.fn() },
  });
  const view = { webContents: contents } as unknown as WebContentsView;
  const preferences = { get: vi.fn(async () => true), getPreferences: () => ({ rememberLastPageVisited: true }) };
  const workspaceService = {
    get: vi.fn(async () => workspace),
    updateMetaData: vi.fn(async () => {}),
    workspaceDidFailLoad: vi.fn(async () => false),
  };
  const service = Object.create(View.prototype) as View;
  Object.assign(service, {
    viewLoads: new WeakMap(),
    menuService: { initContextMenuForWindowWebContents: vi.fn(async () => vi.fn()) },
    preferenceService: preferences,
    workspaceService,
    forEachView: (callback: (view: WebContentsView, id: string, windowName: WindowNames) => void) => {
      callback(view, 'wiki', WindowNames.main);
    },
  });
  return { contents, view, preferences, workspaceService, service };
}

describe('wiki navigation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (!container.isBound(serviceIdentifier.DeepLink)) container.bind(serviceIdentifier.DeepLink).toConstantValue({ openDeepLink: vi.fn() });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('waits for native document reload when the saved location is already current', async () => {
    const { service, contents } = fixture();
    let returned = false;
    const reload = service.reloadViewsWebContents('wiki').then(() => {
      returned = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(contents.loadURL).not.toHaveBeenCalled();
    expect(returned).toBe(false);
    expect(contents.reload).toHaveBeenCalledOnce();
    contents.emit('did-finish-load');
    await reload;
    expect(returned).toBe(true);
  });

  it('rechecks retry validity after asynchronous metadata writes before navigating', async () => {
    const { service, view, contents, workspaceService } = fixture();
    let finish!: () => void;
    workspaceService.updateMetaData.mockImplementation(() =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
    );
    let current = true;
    const loading = service.loadUrlForView(workspace, view, undefined, () => current);
    current = false;
    finish();
    await loading;
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it('waits for a full document reload when restoring a different fragment', async () => {
    const { service, contents } = fixture();
    contents.getURL.mockReturnValue('tidgi://wiki#current');
    let returned = false;
    const reload = service.reloadViewsWebContents('wiki').then(() => {
      returned = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(contents.loadURL).not.toHaveBeenCalled();
    expect(contents.executeJavaScript).toHaveBeenCalledExactlyOnceWith('history.replaceState(history.state, "", "tidgi://wiki#saved")');
    expect(contents.reload).toHaveBeenCalledOnce();
    expect(returned).toBe(false);
    contents.emit('did-finish-load');
    await reload;
    expect(returned).toBe(true);
    expect(contents.listenerCount('did-stop-loading')).toBe(0);
  });

  it('does not abort the first document when a restart requests another load', async () => {
    const { service, view, contents } = fixture();
    contents.reload.mockImplementation(() => {
      contents.emit('did-finish-load');
    });
    let finish!: () => void;
    contents.loadURL.mockImplementationOnce(() =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
    );
    const initial = service.loadUrlForView(workspace, view);
    await vi.advanceTimersByTimeAsync(0);
    const reload = service.reloadViewsWebContents('wiki');
    await vi.advanceTimersByTimeAsync(0);
    expect(contents.loadURL).toHaveBeenCalledOnce();
    finish();
    await Promise.all([initial, reload]);
    expect(contents.loadURL).toHaveBeenCalledOnce();
    expect(contents.reload).toHaveBeenCalledOnce();
  });

  it.each(['did-stop-loading', 'destroyed', 'did-fail-load'])('settles and cleans a document reload on %s', async event => {
    const { service, contents } = fixture();
    contents.getURL.mockReturnValue('tidgi://wiki#current');
    contents.reload.mockImplementation(() => {
      contents.emit(event, {}, -2, 'ERR_FAILED', workspace.lastUrl, true);
    });
    await expect(service.reloadViewsWebContents('wiki')).rejects.toThrow();
    for (const name of ['did-finish-load', 'did-stop-loading', 'destroyed', 'did-fail-load']) {
      expect(contents.listenerCount(name)).toBe(0);
    }
  });

  it('does not reload if restoring the saved fragment fails', async () => {
    const { service, contents } = fixture();
    contents.getURL.mockReturnValue('tidgi://wiki#current');
    contents.executeJavaScript.mockRejectedValueOnce(new Error('Renderer unavailable'));
    await expect(service.reloadViewsWebContents('wiki')).rejects.toThrow('Renderer unavailable');
    expect(contents.loadURL).not.toHaveBeenCalled();
    expect(contents.reload).not.toHaveBeenCalled();
  });

  it.each(['navigation', 'completion', 'destruction'] as const)('cancels an old aborted-load retry after %s', async event => {
    const { view, contents } = fixture();
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    vi.spyOn(workspaceService, 'get').mockResolvedValue(workspace);
    Object.assign(workspaceService, { workspaceDidFailLoad: vi.fn(async () => false) });
    const reload = vi.fn(async () => {});
    setupViewEventHandlers(view, {} as BrowserWindow, {
      workspace,
      windowName: WindowNames.main,
      sharedWebPreferences: {},
      shouldPauseNotifications: false,
      loadInitialUrlWithCatch: reload,
    });
    contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', workspace.homeUrl, true);
    await vi.advanceTimersByTimeAsync(0);
    if (event === 'navigation') contents.emit('did-start-navigation', {}, workspace.homeUrl, false, true);
    else contents.emit(event === 'completion' ? 'did-finish-load' : 'destroyed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries an otherwise idle aborted load and invalidates its guard on subsequent navigation', async () => {
    const { view, contents } = fixture();
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    vi.spyOn(workspaceService, 'get').mockResolvedValue(workspace);
    Object.assign(workspaceService, { workspaceDidFailLoad: vi.fn(async () => false) });
    let isCurrent: (() => boolean) | undefined;
    const reload = vi.fn(async (guard?: () => boolean) => {
      isCurrent = guard;
    });
    setupViewEventHandlers(view, {} as BrowserWindow, {
      workspace,
      windowName: WindowNames.main,
      sharedWebPreferences: {},
      shouldPauseNotifications: false,
      loadInitialUrlWithCatch: reload,
    });
    contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', workspace.homeUrl, true);
    await vi.advanceTimersByTimeAsync(500);
    expect(reload).toHaveBeenCalledOnce();
    expect(isCurrent?.()).toBe(true);
    contents.emit('did-start-navigation', {}, workspace.homeUrl, false, true);
    expect(isCurrent?.()).toBe(false);
  });
});
