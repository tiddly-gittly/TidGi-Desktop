import { mapSeries } from 'bluebird';
import { app, dialog, session } from 'electron';
import { inject, injectable } from 'inversify';

import { WikiChannel } from '@/constants/channels';
import { tiddlywikiLanguagesMap } from '@/constants/languages';
import { WikiCreationMethod } from '@/constants/wikiCreation';
import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
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
import { isWikiWorkspace } from '@services/workspaces/interface';

import { DELAY_MENU_REGISTER } from '@/constants/parameters';
import type { ISyncService } from '@services/sync/interface';
import type { IInitializeWorkspaceOptions, IWorkspaceViewService } from './interface';
import { registerMenu } from './registerMenu';

@injectable()
export class WorkspaceView implements IWorkspaceViewService {
  constructor(
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    setTimeout(() => {
      void registerMenu();
    }, DELAY_MENU_REGISTER);
  }

  public async initializeAllWorkspaceView(): Promise<void> {
    logger.info('initializeAllWorkspaceView() starting', { function: 'initializeAllWorkspaceView' });
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspacesList = await workspaceService.getWorkspacesAsList();
    logger.info(`Found ${workspacesList.length} workspaces to initialize`, {
      workspaces: workspacesList.map(w => ({ id: w.id, name: w.name, isSubWiki: isWikiWorkspace(w) ? w.isSubWiki : false, pageType: w.pageType })),
    });
    // Only load workspace that is not a subwiki and not a page type
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    workspacesList.filter((workspace) => isWikiWorkspace(workspace) && !workspace.isSubWiki && !workspace.pageType).forEach((workspace) => {
      wikiService.setWikiStartLockOn(workspace.id);
    });
    // sorting (-1 will make a in the front, b in the back)
    const sortedList = workspacesList
      .sort((a, b) => a.order - b.order) // sort by order, 1-2<0, so first will be the first
      .sort((a, b) => (a.active && !b.active ? -1 : 0)) // put active wiki first
      .sort((a, b) => (isWikiWorkspace(a) && a.isSubWiki && (!isWikiWorkspace(b) || !b.isSubWiki) ? -1 : 0)); // put subwiki on top, they can't restart wiki, so need to sync them first, then let main wiki restart the wiki // revert this after tw can reload tid from fs
    await mapSeries(sortedList, async (workspace) => {
      await this.initializeWorkspaceView(workspace);
    });
    wikiService.setAllWikiStartLockOff();
  }

  public async initializeWorkspaceView(workspace: IWorkspace, options: IInitializeWorkspaceOptions = {}): Promise<void> {
    logger.info(i18n.t('Log.InitializeWorkspaceView'));

    // Skip initialization for page workspaces - they don't need TiddlyWiki setup
    if (workspace.pageType) {
      logger.info(`Skipping initialization for page workspace: ${workspace.id} (${workspace.pageType})`);
      return;
    }

    const { followHibernateSettingWhenInit = true, syncImmediately = true, isNew = false } = options;
    // skip if workspace don't contains a valid tiddlywiki setup, this allows user to delete workspace later
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const shouldBeMainWiki = isWikiWorkspace(workspace) && !workspace.isSubWiki;
    logger.info('initializeWorkspaceView() checking wiki existence', {
      workspaceId: workspace.id,
      shouldBeMainWiki,
      wikiFolderLocation: isWikiWorkspace(workspace) ? workspace.wikiFolderLocation : undefined,
      function: 'initializeWorkspaceView',
    });
    const checkResult = await wikiService.checkWikiExist(workspace, { shouldBeMainWiki, showDialog: true });
    if (checkResult !== true) {
      logger.warn('initializeWorkspaceView() checkWikiExist found invalid wiki', {
        workspaceId: workspace.id,
        checkResult,
        shouldBeMainWiki,
        wikiFolderLocation: isWikiWorkspace(workspace) ? workspace.wikiFolderLocation : undefined,
        function: 'initializeWorkspaceView',
      });
      return;
    }
    logger.info('initializeWorkspaceView() wiki validation passed', {
      workspaceId: workspace.id,
      function: 'initializeWorkspaceView',
    });
    logger.debug('initializeWorkspaceView() Initializing workspace', {
      workspaceId: workspace.id,
      options: JSON.stringify(options),
      function: 'initializeWorkspaceView',
    });
    if (followHibernateSettingWhenInit) {
      const hibernateUnusedWorkspacesAtLaunch = await this.preferenceService.get('hibernateUnusedWorkspacesAtLaunch');
      if ((hibernateUnusedWorkspacesAtLaunch || (isWikiWorkspace(workspace) && workspace.hibernateWhenUnused)) && !workspace.active) {
        logger.debug(
          `initializeWorkspaceView() quit because ${
            JSON.stringify({
              followHibernateSettingWhenInit,
              'workspace.hibernateWhenUnused': isWikiWorkspace(workspace) ? workspace.hibernateWhenUnused : false,
              'workspace.active': workspace.active,
              hibernateUnusedWorkspacesAtLaunch,
            })
          }`,
        );
        if (isWikiWorkspace(workspace) && !workspace.hibernated) {
          await workspaceService.update(workspace.id, { hibernated: true });
        }
        return;
      }
    }
    const syncGitWhenInitializeWorkspaceView = async () => {
      if (!isWikiWorkspace(workspace)) return;
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
          const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
          if (mainWindow === undefined) {
            throw new Error(i18n.t(`Error.MainWindowMissing`));
          }
          const userInfo = await this.authService.getStorageServiceUserInfo(storageService);

          if (userInfo?.accessToken) {
            // sync in non-blocking way
            void container.get<ISyncService>(serviceIdentifier.Sync).syncWikiIfNeeded(workspace);
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
      // adding WebContentsView for each workspace
      // skip view initialize if this is a sub wiki
      if (isWikiWorkspace(workspace) && workspace.isSubWiki) {
        return;
      }
      // if we run this due to RestartService, then skip the view adding and the while loop, because the workspaceMetadata.isLoading will be false, because addViewForAllBrowserViews will return before it run loadInitialUrlWithCatch
      if (await container.get<IViewService>(serviceIdentifier.View).alreadyHaveView(workspace)) {
        logger.debug('Skip initializeWorkspaceView() because alreadyHaveView');
        return;
      }
      // Create browserView, and if user want a menubar, we also create a new window for that
      await this.addViewForAllBrowserViews(workspace);
      if (isNew && options.from === WikiCreationMethod.Create) {
        const view = container.get<IViewService>(serviceIdentifier.View).getView(workspace.id, WindowNames.main);
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
            await container.get<IWikiService>(serviceIdentifier.Wiki).setWikiLanguage(workspace.id, tiddlywikiLanguageName);
          }
        }
      }
    };

    logger.debug('initializeWorkspaceView() calling wikiStartup', {
      function: 'initializeWorkspaceView',
    });
    await Promise.all([
      container.get<IWikiService>(serviceIdentifier.Wiki).wikiStartup(workspace),
      addViewWhenInitializeWorkspaceView(),
    ]);
    void syncGitWhenInitializeWorkspaceView();
  }

  public async addViewForAllBrowserViews(workspace: IWorkspace): Promise<void> {
    await Promise.all([
      container.get<IViewService>(serviceIdentifier.View).addView(workspace, WindowNames.main),
      this.preferenceService.get('attachToMenubar').then(async (attachToMenubar) => {
        return await (attachToMenubar && container.get<IViewService>(serviceIdentifier.View).addView(workspace, WindowNames.menuBar));
      }),
    ]);
  }

  public async openWorkspaceWindowWithView(workspace: IWorkspace, configs?: { uri?: string }): Promise<void> {
    const uriToOpen = configs?.uri ?? (isWikiWorkspace(workspace) ? workspace.lastUrl : undefined) ?? (isWikiWorkspace(workspace) ? workspace.homeUrl : undefined);
    logger.debug('Open workspace in new window. uriToOpen here will overwrite the decision in initializeWorkspaceViewHandlersAndLoad.', {
      id: workspace.id,
      uriToOpen,
      function: 'openWorkspaceWindowWithView',
    });
    const browserWindow = await container.get<IWindowService>(serviceIdentifier.Window).open(WindowNames.secondary, undefined, { multiple: true }, true);
    const sharedWebPreferences = await container.get<IViewService>(serviceIdentifier.View).getSharedWebPreferences(workspace);
    const view = await container.get<IViewService>(serviceIdentifier.View).createViewAddToWindow(workspace, browserWindow, sharedWebPreferences, WindowNames.secondary);
    logger.debug('View created in new window.', { id: workspace.id, uriToOpen, function: 'openWorkspaceWindowWithView' });
    await container.get<IViewService>(serviceIdentifier.View).initializeWorkspaceViewHandlersAndLoad(browserWindow, view, {
      workspace,
      sharedWebPreferences,
      windowName: WindowNames.secondary,
      uri: uriToOpen,
    });
  }

  public async updateLastUrl(
    workspaceID: string,
    view: Electron.CrossProcessExports.WebContentsView | undefined = container.get<IViewService>(serviceIdentifier.View).getView(workspaceID, WindowNames.main),
  ): Promise<void> {
    if (view?.webContents) {
      const currentUrl = view.webContents.getURL();
      logger.debug('updateLastUrl() Updating lastUrl for workspace', {
        workspaceID,
        currentUrl,
        function: 'updateLastUrl',
      });
      await container.get<IWorkspaceService>(serviceIdentifier.Workspace).update(workspaceID, {
        lastUrl: currentUrl,
      });
    } else {
      logger.warn(`Can't update lastUrl for workspace ${workspaceID}, view is not found`);
    }
  }

  public async openUrlInWorkspace(url: string, id: string): Promise<void> {
    if (typeof id === 'string' && id.length > 0) {
      // if id is defined, switch to that workspace
      await this.setActiveWorkspaceView(id);
      await container.get<IMenuService>(serviceIdentifier.MenuService).buildMenu();
      // load url in the current workspace
      const activeWorkspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace();
      if (activeWorkspace !== undefined) {
        await this.loadURL(url, activeWorkspace.id);
      }
    }
  }

  public async setWorkspaceView(workspaceID: string, workspaceOptions: IWorkspace): Promise<void> {
    await container.get<IWorkspaceService>(serviceIdentifier.Workspace).set(workspaceID, workspaceOptions);
    container.get<IViewService>(serviceIdentifier.View).setViewsAudioPref();
    container.get<IViewService>(serviceIdentifier.View).setViewsNotificationsPref();
  }

  public async setWorkspaceViews(workspaces: Record<string, IWorkspace>): Promise<void> {
    await container.get<IWorkspaceService>(serviceIdentifier.Workspace).setWorkspaces(workspaces);
    container.get<IViewService>(serviceIdentifier.View).setViewsAudioPref();
    container.get<IViewService>(serviceIdentifier.View).setViewsNotificationsPref();
  }

  public async wakeUpWorkspaceView(workspaceID: string): Promise<void> {
    const workspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(workspaceID);
    if (workspace !== undefined) {
      await Promise.all([
        container.get<IWorkspaceService>(serviceIdentifier.Workspace).update(workspaceID, {
          hibernated: false,
        }),
        this.authService.getUserName(workspace).then(userName => container.get<IWikiService>(serviceIdentifier.Wiki).startWiki(workspaceID, userName)),
        this.addViewForAllBrowserViews(workspace),
      ]);
    }
  }

  public async hibernateWorkspaceView(workspaceID: string): Promise<void> {
    const workspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(workspaceID);
    logger.debug(`Hibernating workspace ${workspaceID}, workspace.active: ${String(workspace?.active)}`);
    if (workspace !== undefined && !workspace.active) {
      await Promise.all([
        container.get<IWikiService>(serviceIdentifier.Wiki).stopWiki(workspaceID),
        container.get<IWorkspaceService>(serviceIdentifier.Workspace).update(workspaceID, {
          hibernated: true,
        }),
      ]);
      container.get<IViewService>(serviceIdentifier.View).removeAllViewOfWorkspace(workspaceID, true);
    }
  }

  public async setActiveWorkspaceView(nextWorkspaceID: string): Promise<void> {
    logger.debug('setActiveWorkspaceView', { nextWorkspaceID });
    const [oldActiveWorkspace, newWorkspace] = await Promise.all([
      container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace(),
      container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(nextWorkspaceID),
    ]);
    if (newWorkspace === undefined) {
      throw new Error(`Workspace id ${nextWorkspaceID} does not exist. When setActiveWorkspaceView().`);
    }
    logger.debug(
      `Set active workspace oldActiveWorkspace.id: ${oldActiveWorkspace?.id ?? 'undefined'} nextWorkspaceID: ${nextWorkspaceID} newWorkspace.isSubWiki ${
        String(
          isWikiWorkspace(newWorkspace) ? newWorkspace.isSubWiki : false,
        )
      }`,
    );

    // Handle page workspace - only update workspace state, no view management needed
    if (newWorkspace.pageType) {
      logger.debug(`${nextWorkspaceID} is a page workspace, only updating workspace state.`);
      await container.get<IWorkspaceService>(serviceIdentifier.Workspace).setActiveWorkspace(nextWorkspaceID, oldActiveWorkspace?.id);
      // Hide old workspace view if switching from a regular workspace
      if (oldActiveWorkspace !== undefined && oldActiveWorkspace.id !== nextWorkspaceID && !oldActiveWorkspace.pageType) {
        await this.hideWorkspaceView(oldActiveWorkspace.id);
        if (isWikiWorkspace(oldActiveWorkspace) && oldActiveWorkspace.hibernateWhenUnused) {
          await this.hibernateWorkspaceView(oldActiveWorkspace.id);
        }
      }
      return;
    }

    if (isWikiWorkspace(newWorkspace) && newWorkspace.isSubWiki && typeof newWorkspace.mainWikiID === 'string') {
      logger.debug(`${nextWorkspaceID} is a subwiki, set its main wiki ${newWorkspace.mainWikiID} to active instead.`);
      await this.setActiveWorkspaceView(newWorkspace.mainWikiID);
      if (typeof newWorkspace.tagName === 'string') {
        await container.get<IWikiService>(serviceIdentifier.Wiki).wikiOperationInBrowser(WikiChannel.openTiddler, newWorkspace.mainWikiID, [newWorkspace.tagName]);
      }
      return;
    }
    // later process will use the current active workspace
    await container.get<IWorkspaceService>(serviceIdentifier.Workspace).setActiveWorkspace(nextWorkspaceID, oldActiveWorkspace?.id);
    if (isWikiWorkspace(newWorkspace) && newWorkspace.hibernated) {
      await this.wakeUpWorkspaceView(nextWorkspaceID);
    }
    try {
      await container.get<IViewService>(serviceIdentifier.View).setActiveViewForAllBrowserViews(nextWorkspaceID);
      await this.realignActiveWorkspace(nextWorkspaceID);
    } catch (error) {
      logger.error(`Error while setActiveWorkspaceView(): ${(error as Error).message}`, error);
      throw error;
    }
    // if we are switching to a new workspace, we hide and/or hibernate old view, and activate new view
    if (oldActiveWorkspace !== undefined && oldActiveWorkspace.id !== nextWorkspaceID) {
      await this.hideWorkspaceView(oldActiveWorkspace.id);
      if (isWikiWorkspace(oldActiveWorkspace) && oldActiveWorkspace.hibernateWhenUnused) {
        await this.hibernateWorkspaceView(oldActiveWorkspace.id);
      }
    }
  }

  public async clearActiveWorkspaceView(idToDeactivate?: string): Promise<void> {
    const activeWorkspace = idToDeactivate === undefined
      ? await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace()
      : await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(idToDeactivate);
    await container.get<IWorkspaceService>(serviceIdentifier.Workspace).clearActiveWorkspace(activeWorkspace?.id);
    if (activeWorkspace === undefined) {
      return;
    }
    if (isWikiWorkspace(activeWorkspace) && activeWorkspace.isSubWiki && typeof activeWorkspace.mainWikiID === 'string') {
      logger.debug(`${activeWorkspace.id} is a subwiki, set its main wiki ${activeWorkspace.mainWikiID} to deactivated instead.`, { function: 'clearActiveWorkspaceView' });
      await this.clearActiveWorkspaceView(activeWorkspace.mainWikiID);
      return;
    }
    try {
      await this.hideWorkspaceView(activeWorkspace.id);
    } catch (error) {
      logger.error(`Error while setActiveWorkspaceView(): ${(error as Error).message}`, error);
      throw error;
    }
    if (isWikiWorkspace(activeWorkspace) && activeWorkspace.hibernateWhenUnused) {
      await this.hibernateWorkspaceView(activeWorkspace.id);
    }
  }

  public async removeWorkspaceView(workspaceID: string): Promise<void> {
    container.get<IViewService>(serviceIdentifier.View).removeAllViewOfWorkspace(workspaceID, true);
    const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
    // if there's only one workspace left, clear all
    if ((await container.get<IWorkspaceService>(serviceIdentifier.Workspace).countWorkspaces()) === 1) {
      if (mainWindow !== undefined) {
        mainWindow.setTitle(app.name);
      }
    } else if (
      (await container.get<IWorkspaceService>(serviceIdentifier.Workspace).countWorkspaces()) > 1 &&
      (await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(workspaceID))?.active === true
    ) {
      const previousWorkspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getPreviousWorkspace(workspaceID);
      if (previousWorkspace !== undefined) {
        await this.setActiveWorkspaceView(previousWorkspace.id);
      }
    }
  }

  public async restartWorkspaceViewService(id?: string): Promise<void> {
    const workspaceToRestart = id === undefined
      ? await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace()
      : await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(id);
    if (workspaceToRestart === undefined) {
      logger.warn(`restartWorkspaceViewService: no workspace ${id ?? 'id undefined'} to restart`);
      return;
    }
    if (isWikiWorkspace(workspaceToRestart) && workspaceToRestart.isSubWiki) {
      const mainWikiIDToRestart = workspaceToRestart.mainWikiID;
      if (mainWikiIDToRestart) {
        await this.restartWorkspaceViewService(mainWikiIDToRestart);
      }
      return;
    }
    logger.info(`Restarting workspace ${workspaceToRestart.id}`);
    await this.updateLastUrl(workspaceToRestart.id);
    // start restarting. Set isLoading to false, and it will be set by some callback elsewhere to true.
    await container.get<IWorkspaceService>(serviceIdentifier.Workspace).updateMetaData(workspaceToRestart.id, {
      didFailLoadErrorMessage: null,
      isLoading: false,
      isRestarting: true,
    });
    await container.get<IWikiService>(serviceIdentifier.Wiki).stopWiki(workspaceToRestart.id);
    await this.initializeWorkspaceView(workspaceToRestart, { syncImmediately: false });
    if (await container.get<IWorkspaceService>(serviceIdentifier.Workspace).workspaceDidFailLoad(workspaceToRestart.id)) {
      logger.warn('restartWorkspaceViewService() skip because workspaceDidFailLoad');
      return;
    }
    await container.get<IViewService>(serviceIdentifier.View).reloadViewsWebContents(workspaceToRestart.id);
    await container.get<IWikiService>(serviceIdentifier.Wiki).wikiOperationInBrowser(WikiChannel.generalNotification, workspaceToRestart.id, [
      i18n.t('ContextMenu.RestartServiceComplete'),
    ]);
    await container.get<IWorkspaceService>(serviceIdentifier.Workspace).updateMetaData(workspaceToRestart.id, { isRestarting: false });
  }

  public async restartAllWorkspaceView(): Promise<void> {
    const workspaces = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getWorkspacesAsList();
    await Promise.all(
      workspaces.map(async (workspace) => {
        await Promise.all(
          [WindowNames.main, WindowNames.menuBar].map(async (windowName) => {
            const view = container.get<IViewService>(serviceIdentifier.View).getView(workspace.id, windowName);
            if (view !== undefined) {
              await container.get<IViewService>(serviceIdentifier.View).loadUrlForView(workspace, view);
            }
          }),
        );
      }),
    );
  }

  public async clearBrowsingDataWithConfirm(): Promise<void> {
    const availableWindowToShowDialog = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.preferences) ??
      container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
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
    const workspaces = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getWorkspaces();
    await Promise.all(
      Object.keys(workspaces).map(async (id) => {
        await session.fromPartition(`persist:${id}`).clearStorageData();
      }),
    );

    // shared session
    await session.fromPartition('persist:shared').clearStorageData();
  }

  public async loadURL(url: string, id: string | undefined): Promise<void> {
    const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
    const activeWorkspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace();
    const activeWorkspaceID = id ?? activeWorkspace?.id;
    if (mainWindow !== undefined && activeWorkspaceID !== undefined) {
      const view = container.get<IViewService>(serviceIdentifier.View).getView(activeWorkspaceID, WindowNames.main);
      if (view?.webContents) {
        view.webContents.focus();
        await view.webContents.loadURL(url);
      }
    }
  }

  /**
   * Seems this is for relocating WebContentsView in the electron window
   */
  public async realignActiveWorkspace(id?: string): Promise<void> {
    // this function only call browserView.setBounds
    // do not attempt to recall browserView.webContents.focus()
    // as it breaks page focus (cursor, scroll bar not visible)
    await this.realignActiveWorkspaceView(id);
    try {
      await container.get<IMenuService>(serviceIdentifier.MenuService).buildMenu();
    } catch (error) {
      logger.error(`Error buildMenu() while realignActiveWorkspace(): ${(error as Error).message}`, error);
      throw error;
    }
  }

  private async realignActiveWorkspaceView(id?: string): Promise<void> {
    const workspaceToRealign = id === undefined
      ? await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace()
      : await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(id);
    logger.debug('realignActiveWorkspaceView() activeWorkspace.id', {
      workspaceId: workspaceToRealign?.id ?? 'undefined',
      stack: new Error('stack').stack?.replace('Error:', ''),
      function: 'realignActiveWorkspaceView',
    });
    if (workspaceToRealign && isWikiWorkspace(workspaceToRealign) && workspaceToRealign.isSubWiki) {
      logger.debug('realignActiveWorkspaceView() skip because subwiki; realign main wiki instead', {
        workspaceId: workspaceToRealign.id,
        function: 'realignActiveWorkspaceView',
      });
      if (workspaceToRealign.mainWikiID) {
        await this.realignActiveWorkspaceView(workspaceToRealign.mainWikiID);
      }
      return;
    }
    const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
    const menuBarWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.menuBar);

    logger.info(
      `realignActiveWorkspaceView: id ${workspaceToRealign?.id ?? 'undefined'}`,
    );
    if (workspaceToRealign === undefined) {
      logger.warn('realignActiveWorkspaceView: no active workspace');
      return;
    }
    if (mainWindow === undefined && menuBarWindow === undefined) {
      logger.warn('realignActiveWorkspaceView: no active window');
      return;
    }
    const tasks = [];
    if (mainWindow === undefined) {
      logger.warn(`realignActiveWorkspaceView: no mainBrowserViewWebContent, skip main window for ${workspaceToRealign.id}.`);
    } else {
      tasks.push(container.get<IViewService>(serviceIdentifier.View).realignActiveView(mainWindow, workspaceToRealign.id, WindowNames.main));
      logger.debug(`realignActiveWorkspaceView: realign main window for ${workspaceToRealign.id}.`);
    }
    if (menuBarWindow === undefined) {
      logger.info(`realignActiveWorkspaceView: no menuBarBrowserViewWebContent, skip menu bar window for ${workspaceToRealign.id}.`);
    } else {
      logger.debug(`realignActiveWorkspaceView: realign menu bar window for ${workspaceToRealign.id}.`);
      tasks.push(container.get<IViewService>(serviceIdentifier.View).realignActiveView(menuBarWindow, workspaceToRealign.id, WindowNames.menuBar));
    }
    await Promise.all(tasks);
  }

  private async hideWorkspaceView(idToDeactivate: string): Promise<void> {
    const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
    const menuBarWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.menuBar);
    const tasks = [];
    if (mainWindow === undefined) {
      logger.warn(`hideWorkspaceView: no mainBrowserWindow, skip main window browserView.`);
    } else {
      logger.info(`hideWorkspaceView: hide main window browserView.`);
      tasks.push(container.get<IViewService>(serviceIdentifier.View).hideView(mainWindow, WindowNames.main, idToDeactivate));
    }
    if (menuBarWindow === undefined) {
      logger.debug(`hideWorkspaceView: no menuBarBrowserWindow, skip menu bar window browserView.`);
    } else {
      logger.info(`hideWorkspaceView: hide menu bar window browserView.`);
      tasks.push(container.get<IViewService>(serviceIdentifier.View).hideView(menuBarWindow, WindowNames.menuBar, idToDeactivate));
    }
    await Promise.all(tasks);
    logger.info(`hideWorkspaceView: done.`);
  }
}
