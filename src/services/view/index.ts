import { isTest } from '@/constants/environment';
import { container } from '@services/container';
import { getPreloadPath } from '@services/windows/viteEntry';
import { BrowserWindow, WebContentsView, WebPreferences } from 'electron';
import { inject, injectable } from 'inversify';

import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IThemeService } from '@services/theme/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';

import { MetaDataChannel, WindowChannel } from '@/constants/channels';
import { getDefaultTidGiUrl } from '@/constants/urls';
import getViewBounds from '@services/libs/getViewBounds';
import { logger } from '@services/libs/log';
import { type IBrowserViewMetaData, WindowNames } from '@services/windows/WindowProperties';
import { isWikiWorkspace, type IWorkspace } from '@services/workspaces/interface';
import debounce from 'lodash/debounce';
import { setViewEventName } from './constants';
import { ViewLoadUrlError } from './error';
import type { IViewService } from './interface';
import { registerViewMenu } from './registerMenu';
import { setupIpcServerRoutesHandlers } from './setupIpcServerRoutesHandlers';
import setupViewEventHandlers from './setupViewEventHandlers';
import { setupViewSession } from './setupViewSession';

@injectable()
export class View implements IViewService {
  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.MenuService) private readonly menuService: IMenuService,
  ) {}

  private get windowService(): IWindowService {
    return container.get<IWindowService>(serviceIdentifier.Window);
  }

  private get workspaceService(): IWorkspaceService {
    return container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  }

  public async initialize(): Promise<void> {
    await registerViewMenu();
  }

  // ── Registry ──────────────────────────────────────────────

  /**
   * workspaceID → (windowName → WebContentsView)
   * Views stay in this map even when hidden (offscreen). Only `destroyAllViewsOfWorkspace` removes them.
   */
  private readonly views = new Map<string, Map<WindowNames, WebContentsView>>();

  /**
   * Track resize-listener cleanup functions so we can unbind them on destroy.
   * Key: `${workspaceID}-${windowName}`
   */
  private readonly resizeCleanups = new Map<string, () => void>();

  /**
   * Track custom bounds overrides (e.g. Agent split-view embed).
   * When set, the debounced window-resize handler skips auto-resizing this view.
   */
  private readonly customBoundsMap = new Map<string, { x: number; y: number; width: number; height: number }>();

  private readonly setViewEventTarget = new EventTarget();

  public async getViewCount(): Promise<number> {
    return this.views.size;
  }

  public getView(workspaceID: string, windowName: WindowNames): WebContentsView | undefined {
    let view = this.views.get(workspaceID)?.get(windowName);
    if (view) return view;

    // Case-insensitive fallback — indicates a casing bug elsewhere, but keeps things working
    const lower = workspaceID.toLowerCase();
    for (const [id, windowViews] of this.views.entries()) {
      if (id.toLowerCase() === lower) {
        view = windowViews.get(windowName);
        if (view) {
          logger[process.env.NODE_ENV === 'development' ? 'warn' : 'debug'](
            'getView: case-insensitive match — workspace ID casing inconsistency',
            { requestedId: workspaceID, actualId: id, windowName },
          );
          return view;
        }
      }
    }
    return undefined;
  }

  private setView(workspaceID: string, windowName: WindowNames, newView: WebContentsView): void {
    let windowViews = this.views.get(workspaceID);
    if (windowViews === undefined) {
      windowViews = new Map();
      this.views.set(workspaceID, windowViews);
    }
    windowViews.set(windowName, newView);
    this.setViewEventTarget.dispatchEvent(new Event(setViewEventName(workspaceID, windowName)));
  }

  public forEachView(function_: (view: WebContentsView, workspaceID: string, windowName: WindowNames) => void): void {
    for (const [workspaceID, windowViews] of this.views.entries()) {
      for (const [windowName, view] of windowViews.entries()) {
        function_(view, workspaceID, windowName);
      }
    }
  }

  public async getLoadedViewEnsure(workspaceID: string, windowName: WindowNames): Promise<WebContentsView> {
    let view = this.getView(workspaceID, windowName);
    if (view !== undefined) return view;
    // Wait for view to appear
    await new Promise<void>((resolve) => {
      this.setViewEventTarget.addEventListener(setViewEventName(workspaceID, windowName), () => {
        resolve();
      }, { once: true });
    });
    view = this.getView(workspaceID, windowName);
    if (view === undefined) {
      const message = `Still no view for ${workspaceID} in window ${windowName} after waiting.`;
      logger.error(message, { function: 'getLoadedViewEnsure' });
      throw new Error(message);
    }
    return view;
  }

  // ── Lifecycle ─────────────────────────────────────────────

  private shouldMuteAudio = false;
  private shouldPauseNotifications = false;

  public async alreadyHaveView(workspace: IWorkspace): Promise<boolean> {
    const hasMain = this.getView(workspace.id, WindowNames.main) !== undefined;
    const needsMini = await this.preferenceService.get('tidgiMiniWindow');
    if (!needsMini) return hasMain;
    const hasMini = this.getView(workspace.id, WindowNames.tidgiMiniWindow) !== undefined;
    return hasMain && hasMini;
  }

  public async addView(workspace: IWorkspace, windowName: WindowNames): Promise<void> {
    if (this.getView(workspace.id, windowName) !== undefined) {
      logger.warn(`addView: ${workspace.id}/${windowName} already exists, skipping`);
      return;
    }
    const browserWindow = this.windowService.get(windowName);
    if (browserWindow === undefined) {
      throw new Error(`Browser window ${windowName} is not ready for workspace ${workspace.id}`);
    }
    const sharedWebPreferences = await this.getSharedWebPreferences(workspace);
    const view = await this.createViewAndAttach(workspace, browserWindow, sharedWebPreferences, windowName);
    this.setView(workspace.id, windowName, view);
    await this.initializeViewHandlersAndLoad(browserWindow, view, { workspace, sharedWebPreferences, windowName });
  }

  public async getSharedWebPreferences(workspace: IWorkspace): Promise<WebPreferences> {
    const { spellcheck } = this.preferenceService.getPreferences();
    const sessionOfView = setupViewSession(workspace, this.preferenceService.getPreferences(), () => this.preferenceService.getPreferences());
    const browserViewMetaData: IBrowserViewMetaData = { workspace };
    return {
      devTools: true,
      spellcheck,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      // Prevent JS from being throttled while the window is hidden during E2E tests
      ...(isTest ? { backgroundThrottling: false } : {}),
      session: sessionOfView,
      preload: getPreloadPath(),
      additionalArguments: [
        `${MetaDataChannel.browserViewMetaData}${WindowNames.view}`,
        `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(browserViewMetaData))}`,
        '--unsafely-disable-devtools-self-xss-warnings',
      ],
    } satisfies WebPreferences;
  }

  public async createViewAndAttach(
    workspace: IWorkspace,
    browserWindow: BrowserWindow,
    sharedWebPreferences: WebPreferences,
    windowName: WindowNames,
  ): Promise<WebContentsView> {
    const view = new WebContentsView({ webPreferences: sharedWebPreferences });

    const themeService = container.get<IThemeService>(serviceIdentifier.ThemeService);
    const shouldUseDarkColors = await themeService.shouldUseDarkColors();
    view.setBackgroundColor(shouldUseDarkColors ? '#212121' : '#ffffff');

    if (this.shouldMuteAudio) {
      view.webContents.audioMuted = true;
    }

    // Always add as child — visibility is controlled purely by bounds
    browserWindow.contentView.addChildView(view);

    // Set initial bounds: active or secondary/mini → visible; inactive main → offscreen
    if (workspace.active || windowName !== WindowNames.main) {
      const contentSize = browserWindow.getContentSize();
      view.setBounds(await getViewBounds(contentSize as [number, number], { windowName }));
    } else {
      this.moveOffscreen(view, browserWindow);
    }

    // Wire debounced resize handler, store cleanup function
    const key = `${workspace.id}-${windowName}`;
    const debouncedResize = debounce(async () => {
      if (browserWindow.isDestroyed()) return;
      const ws = await this.workspaceService.get(workspace.id);
      if (ws === undefined) return;
      // Skip resize for hidden (non-active) main-window views
      if (windowName === WindowNames.main && !ws.active) return;
      // Skip resize for views with custom bounds (Agent split-view)
      if (this.customBoundsMap.has(key)) return;

      const contentSize = browserWindow.getContentSize();
      view.setBounds(await getViewBounds(contentSize as [number, number], { windowName }));
    }, 200);

    browserWindow.on('resize', debouncedResize);
    this.resizeCleanups.set(key, () => {
      browserWindow.removeListener('resize', debouncedResize);
    });

    return view;
  }

  public async initializeViewHandlersAndLoad(
    browserWindow: BrowserWindow,
    view: WebContentsView,
    configs: { sharedWebPreferences: WebPreferences; uri?: string; windowName: WindowNames; workspace: IWorkspace },
  ): Promise<void> {
    const { sharedWebPreferences, uri, workspace, windowName } = configs;
    setupViewEventHandlers(view, browserWindow, {
      shouldPauseNotifications: this.shouldPauseNotifications,
      workspace,
      sharedWebPreferences,
      loadInitialUrlWithCatch: async () => {
        await this.loadUrlForView(workspace, view, uri);
      },
      windowName,
    });
    setupIpcServerRoutesHandlers(view, workspace.id);
    await this.loadUrlForView(workspace, view, uri);
  }

  public async loadUrlForView(workspace: IWorkspace, view: WebContentsView, uri?: string): Promise<void> {
    const { rememberLastPageVisited } = this.preferenceService.getPreferences();
    const lastUrl = isWikiWorkspace(workspace) ? workspace.lastUrl : null;
    const homeUrl = isWikiWorkspace(workspace) ? workspace.homeUrl : null;
    const urlToLoad = uri || (rememberLastPageVisited ? lastUrl : homeUrl) || homeUrl || getDefaultTidGiUrl(workspace.id);
    try {
      if (await this.workspaceService.workspaceDidFailLoad(workspace.id)) return;
      await this.workspaceService.updateMetaData(workspace.id, { didFailLoadErrorMessage: null, isLoading: true });
      await view.webContents.loadURL(urlToLoad);
      const unregisterContextMenu = await this.menuService.initContextMenuForWindowWebContents(view.webContents);
      view.webContents.on('destroyed', () => {
        unregisterContextMenu();
      });
    } catch (error) {
      logger.warn(new ViewLoadUrlError(urlToLoad, `${(error as Error).message} ${(error as Error).stack ?? ''}`));
    }
  }

  public async reloadViewsWebContents(workspaceID?: string): Promise<void> {
    const rememberLastPageVisited = await this.preferenceService.get('rememberLastPageVisited');
    this.forEachView(async (view, id) => {
      if (workspaceID !== undefined && id !== workspaceID) return;
      if (!view.webContents) return;
      if (workspaceID !== undefined) {
        const workspace = await this.workspaceService.get(workspaceID);
        if (rememberLastPageVisited && workspace && isWikiWorkspace(workspace) && workspace.lastUrl) {
          try {
            await view.webContents.loadURL(workspace.lastUrl);
          } catch (error) {
            logger.warn(new ViewLoadUrlError(workspace.lastUrl, `${(error as Error).message} ${(error as Error).stack ?? ''}`));
          }
        }
      }
      view.webContents.reload();
    });
  }

  public async reloadViewsWebContentsIfDidFailLoad(): Promise<void> {
    this.forEachView(async (view, id) => {
      if (await this.workspaceService.workspaceDidFailLoad(id)) {
        view.webContents?.reload();
      }
    });
  }

  // ── Visibility (offscreen-bounds only) ────────────────────

  private moveOffscreen(view: WebContentsView, browserWindow: BrowserWindow): void {
    const [w, h] = browserWindow.getContentSize();
    view.setBounds({ x: -w, y: -h, width: w, height: h });
  }

  /**
   * Views that are currently "shown" via showView().
   * setViewBounds(undefined) will NOT move these offscreen, because showView
   * may have already placed them at full-window bounds and a late-arriving
   * cleanup call from WikiEmbedTabContent would hide them.
   */
  private readonly activelyShownViews = new Set<string>();

  public async showView(workspaceID: string, windowName: WindowNames): Promise<void> {
    const view = this.getView(workspaceID, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (view === undefined || browserWindow === undefined) {
      logger.warn('showView: view or window not found', { workspaceID, windowName });
      return;
    }
    // Clear any stale custom bounds (e.g. left over from WikiEmbed split-view)
    // so that realignView / window-resize handlers use normal full-window bounds.
    const key = `${workspaceID}-${windowName}`;
    this.customBoundsMap.delete(key);
    this.activelyShownViews.add(key);
    // Ensure it's a child (idempotent in Electron)
    try {
      browserWindow.contentView.addChildView(view);
    } catch { /* already added */ }
    const contentSize = browserWindow.getContentSize();
    view.setBounds(await getViewBounds(contentSize as [number, number], { windowName }));
    view.webContents.focus();
    browserWindow.setTitle(view.webContents.getTitle());
  }

  public async hideView(workspaceID: string, windowName: WindowNames): Promise<void> {
    const view = this.getView(workspaceID, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (view === undefined || browserWindow === undefined) return;
    const key = `${workspaceID}-${windowName}`;
    this.activelyShownViews.delete(key);
    view.webContents.stopFindInPage('clearSelection');
    view.webContents.send(WindowChannel.closeFindInPage);
    this.moveOffscreen(view, browserWindow);
  }

  public async setViewBounds(
    workspaceID: string,
    windowName: WindowNames,
    bounds?: { x: number; y: number; width: number; height: number },
  ): Promise<void> {
    const key = `${workspaceID}-${windowName}`;
    const view = this.getView(workspaceID, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (view === undefined || browserWindow === undefined) {
      logger.warn('setViewBounds: view or window not found', { workspaceID, windowName });
      return;
    }
    if (bounds) {
      this.customBoundsMap.set(key, bounds);
      try {
        browserWindow.contentView.addChildView(view);
      } catch { /* already added */ }
      view.setBounds(bounds);
    } else {
      this.customBoundsMap.delete(key);
      // Only move offscreen if the view is NOT currently shown via showView().
      // This prevents a late-arriving WikiEmbedTabContent cleanup from hiding
      // a view that showView() has already placed at full-window bounds.
      if (!this.activelyShownViews.has(key)) {
        this.moveOffscreen(view, browserWindow);
      }
    }
  }

  public async realignView(workspaceID: string, windowName: WindowNames): Promise<void> {
    const view = this.getView(workspaceID, windowName);
    const browserWindow = this.windowService.get(windowName);
    if (view?.webContents === undefined || browserWindow === undefined) return;
    const key = `${workspaceID}-${windowName}`;
    if (this.customBoundsMap.has(key)) {
      // Custom bounds set — don't override
      view.setBounds(this.customBoundsMap.get(key)!);
      return;
    }
    const contentSize = browserWindow.getContentSize();
    view.setBounds(await getViewBounds(contentSize as [number, number], { windowName }));
  }

  // ── Destruction ───────────────────────────────────────────

  public hideAllViewsOfWorkspace(workspaceID: string): void {
    const windowViews = this.views.get(workspaceID);
    if (windowViews === undefined) return;
    for (const [windowName] of windowViews) {
      // Fire-and-forget hide (offscreen bounds)
      void this.hideView(workspaceID, windowName);
    }
  }

  public destroyAllViewsOfWorkspace(workspaceID: string): void {
    const windowViews = this.views.get(workspaceID);
    if (windowViews === undefined) return;
    for (const [windowName, view] of windowViews) {
      const key = `${workspaceID}-${windowName}`;
      // Unbind resize listener
      this.resizeCleanups.get(key)?.();
      this.resizeCleanups.delete(key);
      this.customBoundsMap.delete(key);
      this.activelyShownViews.delete(key);
      // Remove from window tree
      const browserWindow = this.windowService.get(windowName);
      if (browserWindow && !browserWindow.isDestroyed()) {
        try {
          browserWindow.contentView.removeChildView(view);
        } catch { /* ok */ }
      }
      // Destroy webContents
      try {
        if (!view.webContents.isDestroyed()) view.webContents.close();
      } catch (error) {
        logger.warn('Failed to close webContents during destroy', { workspaceID, windowName, error });
      }
    }
    this.views.delete(workspaceID);
  }

  // ── Convenience / Query ───────────────────────────────────

  public async getViewCurrentUrl(workspaceID: string, windowName: WindowNames): Promise<string | undefined> {
    return this.getView(workspaceID, windowName)?.webContents.getURL();
  }

  public setViewsAudioPref = (shouldMuteAudio?: boolean): void => {
    if (shouldMuteAudio !== undefined) this.shouldMuteAudio = shouldMuteAudio;
    this.forEachView(async (view, id) => {
      const workspace = await this.workspaceService.get(id);
      if (view && workspace) {
        view.webContents.audioMuted = (isWikiWorkspace(workspace) ? workspace.disableAudio : false) || this.shouldMuteAudio;
      }
    });
  };

  public setViewsNotificationsPref = (shouldPauseNotifications?: boolean): void => {
    if (shouldPauseNotifications !== undefined) this.shouldPauseNotifications = shouldPauseNotifications;
  };
}
