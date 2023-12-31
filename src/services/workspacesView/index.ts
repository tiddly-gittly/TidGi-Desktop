/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable unicorn/consistent-destructuring */
import { mapSeries } from 'bluebird';
import { app, dialog, session } from 'electron';
import { injectable } from 'inversify';

import { WikiChannel } from '@/constants/channels';
import { tiddlywikiLanguagesMap } from '@/constants/languages';
import { WikiCreationMethod } from '@/constants/wikiCreation';
import type { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import type { IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';

import { DELAY_MENU_REGISTER } from '@/constants/parameters';
import { ISyncService } from '@services/sync/interface';
import type { IInitializeWorkspaceOptions, IWorkspaceViewService } from './interface';
import { registerMenu } from './registerMenu';

@injectable()
export class WorkspaceView implements IWorkspaceViewService {
  @lazyInject(serviceIdentifier.Authentication)
  private readonly authService!: IAuthenticationService;

  @lazyInject(serviceIdentifier.View)
  private readonly viewService!: IViewService;

  @lazyInject(serviceIdentifier.Git)
  private readonly gitService!: IGitService;

  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.MenuService)
  private readonly menuService!: IMenuService;

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  @lazyInject(serviceIdentifier.Sync)
  private readonly syncService!: ISyncService;

  constructor() {
    setTimeout(() => {
      void registerMenu();
    }, DELAY_MENU_REGISTER);
  }

  public async initializeAllWorkspaceView(): Promise<void> {
    const workspacesList = await this.workspaceService.getWorkspacesAsList();
    workspacesList.filter((workspace) => !workspace.isSubWiki).forEach((workspace) => {
      this.wikiService.setWikiStartLockOn(workspace.id);
    });
    // sorting (-1 will make a in the front, b in the back)
    const sortedList = workspacesList
      .sort((a, b) => a.order - b.order) // sort by order, 1-2<0, so first will be the first
      .sort((a, b) => (a.active && !b.active ? -1 : 0)) // put active wiki first
      .sort((a, b) => (a.isSubWiki && !b.isSubWiki ? -1 : 0)); // put subwiki on top, they can't restart wiki, so need to sync them first, then let main wiki restart the wiki // revert this after tw can reload tid from fs
    await mapSeries(sortedList, async (workspace) => {
      await this.initializeWorkspaceView(workspace);
    });
    this.wikiService.setAllWikiStartLockOff();
  }

  public async initializeWorkspaceView(workspace: IWorkspace, options: IInitializeWorkspaceOptions = {}): Promise<void> {
    logger.info(i18n.t('Log.InitializeWorkspaceView'));
    const { followHibernateSettingWhenInit = true, syncImmediately = true, isNew = false } = options;
    // skip if workspace don't contains a valid tiddlywiki setup, this allows user to delete workspace later
    if ((await this.wikiService.checkWikiExist(workspace, { shouldBeMainWiki: !workspace.isSubWiki, showDialog: true })) !== true) {
      logger.warn(`initializeWorkspaceView() checkWikiExist found workspace ${workspace.id} don't have a valid wiki, and showDialog.`);
      return;
    }
    logger.debug(`initializeWorkspaceView() Initializing workspace ${workspace.id}, ${JSON.stringify(options)}`);
    if (followHibernateSettingWhenInit) {
      const hibernateUnusedWorkspacesAtLaunch = await this.preferenceService.get('hibernateUnusedWorkspacesAtLaunch');
      if ((hibernateUnusedWorkspacesAtLaunch || workspace.hibernateWhenUnused) && !workspace.active) {
        logger.debug(
          `initializeWorkspaceView() quit because ${
            JSON.stringify({
              followHibernateSettingWhenInit,
              'workspace.hibernateWhenUnused': workspace.hibernateWhenUnused,
              'workspace.active': workspace.active,
              hibernateUnusedWorkspacesAtLaunch,
            })
          }`,
        );
        if (!workspace.hibernated) {
          await this.workspaceService.update(workspace.id, { hibernated: true });
        }
        return;
      }
    }
    const syncGitWhenInitializeWorkspaceView = async () => {
      const { wikiFolderLocation, gitUrl: githubRepoUrl, storageService, isSubWiki } = workspace;
      // we are using syncWikiIfNeeded that handles recursive sync for all subwiki, so we only need to pass main wiki to it in this method.
      if (isSubWiki) {
        return;
      }
      // get sync process ready
      try {
        if (workspace.syncOnStartup && storageService !== SupportedStorageServices.local && syncImmediately) {
          // check synced wiki should have githubRepoUrl
          if (typeof githubRepoUrl !== 'string') {
            throw new TypeError(`githubRepoUrl is undefined in initializeAllWorkspaceView when init ${wikiFolderLocation}`);
          }
          const mainWindow = this.windowService.get(WindowNames.main);
          if (mainWindow === undefined) {
            throw new Error(i18n.t(`Error.MainWindowMissing`));
          }
          const userInfo = await this.authService.getStorageServiceUserInfo(workspace.storageService);
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (userInfo?.accessToken) {
            // sync in non-blocking way
            void this.syncService.syncWikiIfNeeded(workspace);
          } else {
            // user not login into Github or something else
            void dialog.showMessageBox(mainWindow, {
              title: i18n.t('Dialog.StorageServiceUserInfoNoFound'),
              message: i18n.t('Dialog.StorageServiceUserInfoNoFoundDetail'),
              buttons: ['OK'],
              cancelId: 0,
              defaultId: 0,
            });
          }
        }
      } catch (error) {
        logger.error(`Can't sync at wikiStartup(), ${(error as Error).message}\n${(error as Error).stack ?? 'no stack'}`);
      }
    };

    const addViewWhenInitializeWorkspaceView = async (): Promise<void> => {
      // adding BrowserView for each workspace
      // skip view initialize if this is a sub wiki
      if (workspace.isSubWiki) {
        return;
      }
      // if we run this due to RestartService, then skip the view adding and the while loop, because the workspaceMetadata.isLoading will be false, because addViewForAllBrowserViews will return before it run loadInitialUrlWithCatch
      if (await this.viewService.alreadyHaveView(workspace)) {
        logger.debug('Skip initializeWorkspaceView() because alreadyHaveView');
        return;
      }
      // Create browserView, and if user want a menubar, we also create a new window for that
      await this.addViewForAllBrowserViews(workspace);
      if (isNew && options.from === WikiCreationMethod.Create) {
        const view = this.viewService.getView(workspace.id, WindowNames.main);
        if (view !== undefined) {
          // if is newly created wiki, we set the language as user preference
          const currentLanguage = await this.preferenceService.get('language');
          const tiddlywikiLanguageName = tiddlywikiLanguagesMap[currentLanguage];
          if (tiddlywikiLanguageName === undefined) {
            const errorMessage = `When creating new wiki, and switch to language "${currentLanguage}", there is no corresponding tiddlywiki language registered`;
            logger.error(errorMessage, {
              tiddlywikiLanguagesMap,
            });
          } else {
            logger.debug(`Setting wiki language to ${currentLanguage} (${tiddlywikiLanguageName}) on init`);
            await this.wikiService.setWikiLanguage(workspace.id, tiddlywikiLanguageName);
          }
        }
      }
    };
    const initDatabaseWhenInitializeWorkspaceView = async (): Promise<void> => {
      if (workspace.isSubWiki) {
        return;
      }
      // after all init finished, create cache database if there is no one
      await this.databaseService.initializeForWorkspace(workspace.id);
    };

    logger.debug(`initializeWorkspaceView() calling wikiStartup()`);
    await Promise.all([
      this.wikiService.wikiStartup(workspace),
      addViewWhenInitializeWorkspaceView(),
      initDatabaseWhenInitializeWorkspaceView(),
    ]);
    void syncGitWhenInitializeWorkspaceView();
  }

  public async addViewForAllBrowserViews(workspace: IWorkspace): Promise<void> {
    await Promise.all([
      this.viewService.addView(workspace, WindowNames.main),
      this.preferenceService.get('attachToMenubar').then(async (attachToMenubar) => {
        return await (attachToMenubar && this.viewService.addView(workspace, WindowNames.menuBar));
      }),
    ]);
  }

  public async openWorkspaceWindowWithView(workspace: IWorkspace, configs?: { uri?: string }): Promise<void> {
    const uriToOpen = configs?.uri ?? workspace.lastUrl ?? workspace.homeUrl;
    logger.debug('Open workspace in new window. uriToOpen here will overwrite the decision in initializeWorkspaceViewHandlersAndLoad.', {
      id: workspace.id,
      uriToOpen,
      function: 'openWorkspaceWindowWithView',
    });
    const browserWindow = await this.windowService.open(WindowNames.secondary, undefined, { multiple: true }, true);
    const sharedWebPreferences = await this.viewService.getSharedWebPreferences(workspace);
    const view = await this.viewService.createViewAddToWindow(workspace, browserWindow, sharedWebPreferences, WindowNames.secondary);
    logger.debug('View created in new window.', { id: workspace.id, uriToOpen, function: 'openWorkspaceWindowWithView' });
    await this.viewService.initializeWorkspaceViewHandlersAndLoad(workspace, browserWindow, view, sharedWebPreferences, uriToOpen);
  }

  public async updateLastUrl(
    workspaceID: string,
    view: Electron.CrossProcessExports.BrowserView | undefined = this.viewService.getView(workspaceID, WindowNames.main),
  ): Promise<void> {
    if (view === undefined) {
      logger.warn(`Can't update lastUrl for workspace ${workspaceID}, view is not found`);
    } else {
      const currentUrl = view.webContents.getURL();
      logger.debug(`updateLastUrl() Updating lastUrl for workspace ${workspaceID} to ${currentUrl}`);
      await this.workspaceService.update(workspaceID, {
        lastUrl: currentUrl,
      });
    }
  }

  public async openUrlInWorkspace(url: string, id: string): Promise<void> {
    if (typeof id === 'string' && id.length > 0) {
      // if id is defined, switch to that workspace
      await this.setActiveWorkspaceView(id);
      await this.menuService.buildMenu();
      // load url in the current workspace
      const activeWorkspace = await this.workspaceService.getActiveWorkspace();
      if (activeWorkspace !== undefined) {
        await this.loadURL(url, activeWorkspace.id);
      }
    }
  }

  public async printTiddler(tiddlerName: string): Promise<void> {
    const browserView = await this.viewService.getActiveBrowserView();
    logger.info(`printTiddler() printing tiddler ${tiddlerName ?? 'undefined'}, browserView is ${browserView?.webContents === undefined ? 'undefined' : 'define'}`);
    browserView?.webContents?.send?.(WikiChannel.printTiddler, tiddlerName);
  }

  public async setWorkspaceView(workspaceID: string, workspaceOptions: IWorkspace): Promise<void> {
    await this.workspaceService.set(workspaceID, workspaceOptions);
    this.viewService.setViewsAudioPref();
    this.viewService.setViewsNotificationsPref();
  }

  public async setWorkspaceViews(workspaces: Record<string, IWorkspace>): Promise<void> {
    await this.workspaceService.setWorkspaces(workspaces);
    this.viewService.setViewsAudioPref();
    this.viewService.setViewsNotificationsPref();
  }

  public async wakeUpWorkspaceView(workspaceID: string): Promise<void> {
    const workspace = await this.workspaceService.get(workspaceID);
    if (workspace !== undefined) {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      const userName = await this.authService.getUserName(workspace);
      await this.workspaceService.update(workspaceID, {
        hibernated: false,
      });
      await Promise.all([
        this.wikiService.startWiki(workspaceID, userName),
        this.addViewForAllBrowserViews(workspace),
      ]);
    }
  }

  public async hibernateWorkspaceView(workspaceID: string): Promise<void> {
    const workspace = await this.workspaceService.get(workspaceID);
    logger.debug(`Hibernating workspace ${workspaceID}, workspace.active: ${String(workspace?.active)}`);
    if (workspace !== undefined && !workspace.active) {
      await Promise.all([
        this.wikiService.stopWiki(workspaceID),
        this.workspaceService.update(workspaceID, {
          hibernated: true,
        }),
      ]);
      this.viewService.removeAllViewOfWorkspace(workspaceID);
    }
  }

  public async setActiveWorkspaceView(nextWorkspaceID: string): Promise<void> {
    const oldActiveWorkspace = await this.workspaceService.getActiveWorkspace();
    const newWorkspace = await this.workspaceService.get(nextWorkspaceID);
    if (newWorkspace === undefined) {
      throw new Error(`Workspace id ${nextWorkspaceID} does not exist. When setActiveWorkspaceView().`);
    }
    logger.debug(
      `Set active workspace oldActiveWorkspace.id: ${oldActiveWorkspace?.id ?? 'undefined'} nextWorkspaceID: ${nextWorkspaceID} newWorkspace.isSubWiki ${
        String(
          newWorkspace.isSubWiki,
        )
      }`,
    );
    if (newWorkspace.isSubWiki && typeof newWorkspace.mainWikiID === 'string') {
      logger.debug(`${nextWorkspaceID} is a subwiki, set its main wiki ${newWorkspace.mainWikiID} to active instead.`);
      await this.setActiveWorkspaceView(newWorkspace.mainWikiID);
      if (typeof newWorkspace.tagName === 'string') {
        await this.wikiService.wikiOperationInBrowser(WikiChannel.openTiddler, newWorkspace.mainWikiID, [newWorkspace.tagName]);
      }
      return;
    }
    // later process will use the current active workspace
    await this.workspaceService.setActiveWorkspace(nextWorkspaceID, oldActiveWorkspace?.id);
    if (newWorkspace.hibernated) {
      await this.wakeUpWorkspaceView(nextWorkspaceID);
    }
    try {
      await this.viewService.setActiveViewForAllBrowserViews(nextWorkspaceID);
      await this.realignActiveWorkspace(nextWorkspaceID);
    } catch (error) {
      logger.error(`Error while setActiveWorkspaceView(): ${(error as Error).message}`, error);
      throw error;
    }
    // if we are switching to a new workspace, we hibernate old view, and activate new view
    if (oldActiveWorkspace !== undefined && oldActiveWorkspace.id !== nextWorkspaceID && oldActiveWorkspace.hibernateWhenUnused) {
      await this.hibernateWorkspaceView(oldActiveWorkspace.id);
    }
  }

  public async clearActiveWorkspaceView(idToDeactivate?: string): Promise<void> {
    const activeWorkspace = idToDeactivate === undefined ? await this.workspaceService.getActiveWorkspace() : await this.workspaceService.get(idToDeactivate);
    await this.workspaceService.clearActiveWorkspace(activeWorkspace?.id);
    if (activeWorkspace === undefined) {
      return;
    }
    if (activeWorkspace.isSubWiki && typeof activeWorkspace.mainWikiID === 'string') {
      logger.debug(`${activeWorkspace.id} is a subwiki, set its main wiki ${activeWorkspace.mainWikiID} to deactivated instead.`, { function: 'clearActiveWorkspaceView' });
      await this.clearActiveWorkspaceView(activeWorkspace.mainWikiID);
      return;
    }
    try {
      await this.hideWorkspaceView();
    } catch (error) {
      logger.error(`Error while setActiveWorkspaceView(): ${(error as Error).message}`, error);
      throw error;
    }
    if (activeWorkspace.hibernateWhenUnused) {
      await this.hibernateWorkspaceView(activeWorkspace.id);
    }
  }

  public async removeWorkspaceView(workspaceID: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    // if there's only one workspace left, clear all
    if ((await this.workspaceService.countWorkspaces()) === 1) {
      if (mainWindow !== undefined) {
        // eslint-disable-next-line unicorn/no-null
        mainWindow.setBrowserView(null);
        mainWindow.setTitle(app.name);
      }
    } else if ((await this.workspaceService.countWorkspaces()) > 1 && (await this.workspaceService.get(workspaceID))?.active === true) {
      const previousWorkspace = await this.workspaceService.getPreviousWorkspace(workspaceID);
      if (previousWorkspace !== undefined) {
        await this.setActiveWorkspaceView(previousWorkspace.id);
      }
    }

    await this.workspaceService.remove(workspaceID);
    // TODO: seems a window can only have a browser view, and is shared between workspaces
    // this.viewService.removeAllViewOfWorkspace(workspaceID);
  }

  public async restartWorkspaceViewService(id?: string): Promise<void> {
    const workspaceToRestart = id === undefined ? await this.workspaceService.getActiveWorkspace() : await this.workspaceService.get(id);
    if (workspaceToRestart === undefined) {
      logger.warn(`restartWorkspaceViewService: no workspace ${id ?? 'id undefined'} to restart`);
      return;
    }
    if (workspaceToRestart.isSubWiki) {
      return;
    }
    logger.info(`Restarting workspace ${workspaceToRestart.id}`);
    await this.updateLastUrl(workspaceToRestart.id);
    await this.workspaceService.updateMetaData(workspaceToRestart.id, { didFailLoadErrorMessage: null, isLoading: false });
    await this.wikiService.stopWiki(workspaceToRestart.id);
    await this.initializeWorkspaceView(workspaceToRestart, { syncImmediately: false });
    if (await this.workspaceService.workspaceDidFailLoad(workspaceToRestart.id)) {
      logger.warn('restartWorkspaceViewService() skip because workspaceDidFailLoad');
      return;
    }
    await this.viewService.reloadViewsWebContents(workspaceToRestart.id);
    await this.wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, workspaceToRestart.id, [i18n.t('ContextMenu.RestartServiceComplete')]);
  }

  public async restartAllWorkspaceView(): Promise<void> {
    const workspaces = await this.workspaceService.getWorkspacesAsList();
    await Promise.all(
      workspaces.map(async (workspace) => {
        await Promise.all(
          [WindowNames.main, WindowNames.menuBar].map(async (windowName) => {
            const view = this.viewService.getView(workspace.id, windowName);
            if (view !== undefined) {
              await this.viewService.loadUrlForView(workspace, view);
            }
          }),
        );
      }),
    );
  }

  public async clearBrowsingDataWithConfirm(): Promise<void> {
    const availableWindowToShowDialog = this.windowService.get(WindowNames.preferences) ?? this.windowService.get(WindowNames.main);
    if (availableWindowToShowDialog !== undefined) {
      await dialog
        .showMessageBox(availableWindowToShowDialog, {
          type: 'question',
          buttons: [i18n.t('Preference.ResetNow'), i18n.t('Cancel')],
          message: i18n.t('Preference.ClearBrowsingDataMessage'),
          cancelId: 1,
        })
        .then(async ({ response }) => {
          if (response === 0) {
            await this.clearBrowsingData();
          }
        })
        .catch(console.error);
    }
  }

  public async clearBrowsingData(): Promise<void> {
    await session.defaultSession.clearStorageData();
    const workspaces = await this.workspaceService.getWorkspaces();
    await Promise.all(
      Object.keys(workspaces).map(async (id) => {
        await session.fromPartition(`persist:${id}`).clearStorageData();
      }),
    );

    // shared session
    await session.fromPartition('persist:shared').clearStorageData();
  }

  public async loadURL(url: string, id: string | undefined): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    const activeWorkspace = await this.workspaceService.getActiveWorkspace();
    const activeWorkspaceID = id ?? activeWorkspace?.id;
    if (mainWindow !== undefined && activeWorkspaceID !== undefined) {
      const browserView = mainWindow.getBrowserView();
      if (browserView !== null) {
        browserView.webContents.focus();
        await browserView.webContents.loadURL(url);
      }
    }
  }

  /**
   * Seems this is for relocating BrowserView in the electron window
   */
  public async realignActiveWorkspace(id?: string): Promise<void> {
    // this function only call browserView.setBounds
    // do not attempt to recall browserView.webContents.focus()
    // as it breaks page focus (cursor, scroll bar not visible)
    await this.realignActiveWorkspaceView(id);
    try {
      await this.menuService.buildMenu();
    } catch (error) {
      logger.error(`Error buildMenu() while realignActiveWorkspace(): ${(error as Error).message}`, error);
      throw error;
    }
  }

  private async realignActiveWorkspaceView(id?: string): Promise<void> {
    const workspaceToRealign = id === undefined ? await this.workspaceService.getActiveWorkspace() : await this.workspaceService.get(id);
    logger.debug(`realignActiveWorkspaceView() activeWorkspace.id: ${workspaceToRealign?.id ?? 'undefined'}`, { stack: new Error('stack').stack?.replace('Error:', '') });
    const mainWindow = this.windowService.get(WindowNames.main);
    const menuBarWindow = this.windowService.get(WindowNames.menuBar);
    const mainBrowserViewWebContent = mainWindow?.getBrowserView()?.webContents;
    const menuBarBrowserViewWebContent = menuBarWindow?.getBrowserView()?.webContents;
    /* eslint-disable @typescript-eslint/strict-boolean-expressions */
    logger.info(
      `realignActiveWorkspaceView: id ${workspaceToRealign?.id ?? 'undefined'} mainWindow: ${String(!!mainBrowserViewWebContent)} menuBarWindow: ${
        String(
          !!menuBarBrowserViewWebContent,
        )
      }`,
    );
    if (workspaceToRealign === undefined) {
      logger.warn('realignActiveWorkspaceView: no active workspace');
    } else {
      if (mainWindow === undefined && menuBarWindow === undefined) {
        logger.warn('realignActiveWorkspaceView: no active window');
      }
      const tasks = [];
      if (mainBrowserViewWebContent) {
        tasks.push(this.viewService.realignActiveView(mainWindow, workspaceToRealign.id));
        logger.debug(`realignActiveWorkspaceView: realign main window for ${workspaceToRealign.id}.`);
      } else {
        logger.warn(`realignActiveWorkspaceView: no mainBrowserViewWebContent, skip main window for ${workspaceToRealign.id}.`);
      }
      if (menuBarBrowserViewWebContent) {
        logger.debug(`realignActiveWorkspaceView: realign menu bar window for ${workspaceToRealign.id}.`);
        tasks.push(this.viewService.realignActiveView(menuBarWindow, workspaceToRealign.id));
      } else {
        logger.info(`realignActiveWorkspaceView: no menuBarBrowserViewWebContent, skip menu bar window for ${workspaceToRealign.id}.`);
      }
      await Promise.all(tasks);
    }
  }

  private async hideWorkspaceView(): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    const menuBarWindow = this.windowService.get(WindowNames.menuBar);
    const mainBrowserViewWebContent = mainWindow?.getBrowserView()?.webContents;
    const menuBarBrowserViewWebContent = menuBarWindow?.getBrowserView()?.webContents;
    const tasks = [];
    if (mainBrowserViewWebContent) {
      tasks.push(this.viewService.hideView(mainWindow));
      logger.debug(`hideActiveWorkspaceView: hide main window browserView.`);
    } else {
      logger.warn(`hideActiveWorkspaceView: no mainBrowserViewWebContent, skip main window browserView.`);
    }
    if (menuBarBrowserViewWebContent) {
      logger.debug(`hideActiveWorkspaceView: hide menu bar window browserView.`);
      tasks.push(this.viewService.hideView(menuBarWindow));
    } else {
      logger.info(`hideActiveWorkspaceView: no menuBarBrowserViewWebContent, skip menu bar window browserView.`);
    }
    await Promise.all(tasks);
  }
  /* eslint-enable @typescript-eslint/strict-boolean-expressions */
}
