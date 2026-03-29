import { mapSeries } from 'bluebird';
import { app, dialog, session } from 'electron';
import { inject, injectable } from 'inversify';

import { WikiChannel } from '@/constants/channels';
import { WikiCreationMethod } from '@/constants/wikiCreation';
import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IContextService } from '@services/context/interface';
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
import { workspaceSorter } from '@services/workspaces/utilities';
import type { IInitializeWorkspaceOptions, IWorkspaceViewService } from './interface';
import { registerMenu } from './registerMenu';
import { getTidgiMiniWindowTargetWorkspace } from './utilities';

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
    logger.info('starting', { function: 'initializeAllWorkspaceView' });
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspacesList = await workspaceService.getWorkspacesAsList();
    logger.info(`Found ${workspacesList.length} workspaces to initialize`, {
      workspaces: workspacesList.map(w => ({ id: w.id, name: w.name, isSubWiki: isWikiWorkspace(w) ? w.isSubWiki : false, pageType: w.pageType })),
    }, { function: 'initializeAllWorkspaceView' });
    // Only load workspace that is not a subwiki and not a page type
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    workspacesList.filter((workspace) => isWikiWorkspace(workspace) && !workspace.isSubWiki && !workspace.pageType).forEach((workspace) => {
      wikiService.setWikiStartLockOn(workspace.id);
    });
    const sortedList = workspacesList
      .sort(workspaceSorter)
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
      logger.info('skipping initialization for page workspace', { function: 'initializeWorkspaceView', workspaceId: workspace.id, pageType: workspace.pageType });
      return;
    }

    const { followHibernateSettingWhenInit = true, syncImmediately = true, isNew = false } = options;
    // skip if workspace don't contains a valid tiddlywiki setup, this allows user to delete workspace later
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const shouldBeMainWiki = isWikiWorkspace(workspace) && !workspace.isSubWiki;
    logger.info('checking wiki existence', {
      workspaceId: workspace.id,
      shouldBeMainWiki,
      wikiFolderLocation: isWikiWorkspace(workspace) ? workspace.wikiFolderLocation : undefined,
      function: 'initializeWorkspaceView',
    });
    const checkResult = await wikiService.checkWikiExist(workspace, { shouldBeMainWiki, showDialog: true });
    if (checkResult !== true) {
      logger.warn('checkWikiExist found invalid wiki', {
        workspaceId: workspace.id,
        checkResult,
        shouldBeMainWiki,
        wikiFolderLocation: isWikiWorkspace(workspace) ? workspace.wikiFolderLocation : undefined,
        function: 'initializeWorkspaceView',
      });
      return;
    }
    logger.info('wiki validation passed', {
      workspaceId: workspace.id,
      function: 'initializeWorkspaceView',
    });
    logger.debug('Initializing workspace', {
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
      // Workspace is NOT being hibernated - clear any stale hibernated flag from a previous session
      // to avoid a state mismatch where views run but the sidebar still shows the workspace as sleeping.
      if (isWikiWorkspace(workspace) && workspace.hibernated) {
        await workspaceService.update(workspace.id, { hibernated: false });
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
        logger.error('wikiStartup sync failed', {
          function: 'initializeAllWorkspaceView',
          error,
        });
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
        logger.debug('Skip because alreadyHaveView');
        return;
      }
      // Create browserView, and if user want a tidgi mini window, we also create a new window for that
      await this.addViewForAllBrowserViews(workspace);
      if (isNew && options.from === WikiCreationMethod.Create) {
        const view = container.get<IViewService>(serviceIdentifier.View).getView(workspace.id, WindowNames.main);
        if (view !== undefined) {
          // if is newly created wiki, we set the language as user preference
          const currentLanguage = await this.preferenceService.get('language');
          const contextService = container.get<IContextService>(serviceIdentifier.Context);
          const tiddlywikiLanguagesMap = await contextService.get('tiddlywikiLanguagesMap');
          const tiddlywikiLanguageName = tiddlywikiLanguagesMap[currentLanguage];
          if (tiddlywikiLanguageName === undefined) {
            const errorMessage = `When creating new wiki, and switch to language "${currentLanguage}", there is no corresponding tiddlywiki language registered`;
            logger.error(errorMessage, {
              tiddlywikiLanguagesMap,
            });
          } else {
            logger.debug('setting wiki language on init', { function: 'initializeWorkspaceView', currentLanguage, tiddlywikiLanguageName });
            await container.get<IWikiService>(serviceIdentifier.Wiki).setWikiLanguage(workspace.id, tiddlywikiLanguageName);
          }
        }
      }
    };

    logger.debug('calling wikiStartup', {
      function: 'initializeWorkspaceView',
    });
    await Promise.all([
      container.get<IWikiService>(serviceIdentifier.Wiki).wikiStartup(workspace),
      addViewWhenInitializeWorkspaceView(),
    ]);
    void syncGitWhenInitializeWorkspaceView();
  }

  public async addViewForAllBrowserViews(workspace: IWorkspace): Promise<void> {
    const mainTask = container.get<IViewService>(serviceIdentifier.View).addView(workspace, WindowNames.main);

    // For tidgi mini window, decide which workspace to show based on preferences
    const tidgiMiniWindowTask = (async () => {
      const tidgiMiniWindow = await this.preferenceService.get('tidgiMiniWindow');
      if (!tidgiMiniWindow) {
        return;
      }
      const { shouldSync, targetWorkspaceId } = await getTidgiMiniWindowTargetWorkspace(workspace.id);
      // If syncing with main window, use the current workspace
      if (shouldSync) {
        await container.get<IViewService>(serviceIdentifier.View).addView(workspace, WindowNames.tidgiMiniWindow);
        return;
      }
      // If not syncing and a fixed workspace is set, only add view if this IS the fixed workspace
      if (targetWorkspaceId && workspace.id === targetWorkspaceId) {
        await container.get<IViewService>(serviceIdentifier.View).addView(workspace, WindowNames.tidgiMiniWindow);
      }
      // If not syncing and no fixed workspace is set, don't add any view (user needs to select one)
    })();

    await Promise.all([mainTask, tidgiMiniWindowTask]);
  }

  public async openWorkspaceWindowWithView(workspace: IWorkspace, configs?: { uri?: string }): Promise<void> {
    const uriToOpen = configs?.uri ?? (isWikiWorkspace(workspace) ? workspace.lastUrl : undefined) ?? (isWikiWorkspace(workspace) ? workspace.homeUrl : undefined);
    logger.debug('Open workspace in new window. uriToOpen here will overwrite the decision in initializeViewHandlersAndLoad.', {
      id: workspace.id,
      uriToOpen,
      function: 'openWorkspaceWindowWithView',
    });
    const browserWindow = await container.get<IWindowService>(serviceIdentifier.Window).open(WindowNames.secondary, undefined, { multiple: true }, true);
    const sharedWebPreferences = await container.get<IViewService>(serviceIdentifier.View).getSharedWebPreferences(workspace);
    const view = await container.get<IViewService>(serviceIdentifier.View).createViewAndAttach(workspace, browserWindow, sharedWebPreferences, WindowNames.secondary);
    logger.debug('View created in new window.', { id: workspace.id, uriToOpen, function: 'openWorkspaceWindowWithView' });
    await container.get<IViewService>(serviceIdentifier.View).initializeViewHandlersAndLoad(browserWindow, view, {
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
      logger.debug('Updating lastUrl for workspace', {
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
      // First, update workspace state and start wiki server
      await Promise.all([
        container.get<IWorkspaceService>(serviceIdentifier.Workspace).update(workspaceID, {
          hibernated: false,
        }),
        this.authService.getUserName(workspace).then(userName => container.get<IWikiService>(serviceIdentifier.Wiki).startWiki(workspaceID, userName)),
      ]);

      // Then add view after wiki server is ready and workspace is marked as not hibernated
      await this.addViewForAllBrowserViews(workspace);
    }
  }

  public async hibernateWorkspaceView(workspaceID: string): Promise<void> {
    const workspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(workspaceID);
    logger.debug('hibernating workspace', {
      function: 'hibernateWorkspaceView',
      workspaceID,
      active: String(workspace?.active),
    });
    if (workspace !== undefined && !workspace.active) {
      await Promise.all([
        container.get<IWikiService>(serviceIdentifier.Wiki).stopWiki(workspaceID),
        container.get<IWorkspaceService>(serviceIdentifier.Workspace).update(workspaceID, {
          hibernated: true,
        }),
      ]);
      container.get<IViewService>(serviceIdentifier.View).destroyAllViewsOfWorkspace(workspaceID);
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
      // Hide the previous real wiki's view (it must stay alive because the agent's webview needs the server).
      // Record its ID so we can hibernate it when the user eventually switches to a different real wiki.
      if (oldActiveWorkspace !== undefined && !oldActiveWorkspace.pageType && oldActiveWorkspace.id !== nextWorkspaceID) {
        await this.hideWorkspaceView(oldActiveWorkspace.id);
        this.lastNonPageWorkspaceID = oldActiveWorkspace.id;
      }
      // If we're chaining page→page, leave lastNonPageWorkspaceID unchanged (the deferred wiki is still pending).
      return;
    }

    if (isWikiWorkspace(newWorkspace) && newWorkspace.isSubWiki && typeof newWorkspace.mainWikiID === 'string') {
      logger.debug(`${nextWorkspaceID} is a subwiki, set its main wiki ${newWorkspace.mainWikiID} to active instead.`);
      await this.setActiveWorkspaceView(newWorkspace.mainWikiID);
      // Open the first tag if available
      if (newWorkspace.tagNames.length > 0) {
        await container.get<IWikiService>(serviceIdentifier.Wiki).wikiOperationInBrowser(WikiChannel.openTiddler, newWorkspace.mainWikiID, [newWorkspace.tagNames[0]]);
      }
      return;
    }
    // later process will use the current active workspace
    await container.get<IWorkspaceService>(serviceIdentifier.Workspace).setActiveWorkspace(nextWorkspaceID, oldActiveWorkspace?.id);

    // When coming from a page workspace (agent), the wiki that was active *before* the agent was
    // deferred and kept alive. Hibernate it now that we have a real wiki destination.
    // When coming from a real wiki directly, hibernate that wiki.
    const wikiToHibernate = oldActiveWorkspace?.pageType ? this.lastNonPageWorkspaceID : oldActiveWorkspace?.id;
    this.lastNonPageWorkspaceID = undefined;
    if (wikiToHibernate !== undefined && wikiToHibernate !== nextWorkspaceID) {
      void this.hibernateWorkspace(wikiToHibernate);
    }

    // If a previous switch fired a background hibernation for the workspace we are NOW switching TO,
    // wait for it to finish so we don't race between destroy-views and create-views.
    const pendingHibernation = this.hibernatingWorkspaces.get(nextWorkspaceID);
    if (pendingHibernation !== undefined) {
      logger.debug('setActiveWorkspaceView: waiting for in-flight hibernation to finish', { nextWorkspaceID });
      await pendingHibernation;
    }

    // Re-fetch workspace state after any hibernation completed above, since hibernated flag may have changed.
    const freshWorkspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(nextWorkspaceID);
    if (freshWorkspace === undefined) {
      throw new Error(`Workspace id ${nextWorkspaceID} disappeared while switching. In setActiveWorkspaceView().`);
    }

    if (isWikiWorkspace(freshWorkspace) && freshWorkspace.hibernated) {
      await this.wakeUpWorkspaceView(nextWorkspaceID);
    }

    // fix #556 and #593: Ensure wiki worker is started before showing the view. This must happen before `showWorkspaceView` to ensure the worker is ready when view is created.
    if (isWikiWorkspace(freshWorkspace) && !freshWorkspace.hibernated) {
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      const worker = wikiService.getWorker(nextWorkspaceID);
      if (worker === undefined) {
        const userName = await this.authService.getUserName(freshWorkspace);
        await wikiService.startWiki(nextWorkspaceID, userName);
      }
    }

    try {
      // showWorkspaceView calls showView() which sets correct bounds via getViewBounds.
      // A separate realignActiveWorkspace() would call realignView() immediately after,
      // duplicating setBounds and — before the refactor — also duplicating remove+add which
      // would clobber the focus() set by showView().  Rebuild the menu here instead.
      await this.showWorkspaceView(nextWorkspaceID);
      await container.get<IMenuService>(serviceIdentifier.MenuService).buildMenu();
    } catch (error) {
      logger.error('setActiveWorkspaceView error', {
        function: 'setActiveWorkspaceView',
        error,
      });
      throw error;
    }
  }

  // Tracks workspace IDs currently undergoing background hibernation.
  // Stored as a Map so callers can await the in-flight promise when switching back to the same workspace.
  private readonly hibernatingWorkspaces = new Map<string, Promise<void>>();

  /**
   * When we switch from a wiki workspace to a page workspace (agent), the wiki's server must stay
   * alive (the agent's embedded webview still needs it). We defer hibernation of that wiki until
   * the user switches to a different real wiki. This field stores that deferred wiki ID.
   */
  private lastNonPageWorkspaceID: string | undefined;

  /**
   * This promise could be `void` to let go, not blocking other logic like switch to new workspace, and hibernate workspace on background.
   */
  private async hibernateWorkspace(workspaceID: string): Promise<void> {
    if (this.hibernatingWorkspaces.has(workspaceID)) {
      logger.debug('hibernateWorkspace: already in progress, skipping duplicate call', { workspaceID });
      return this.hibernatingWorkspaces.get(workspaceID)!;
    }
    const promise = (async () => {
      try {
        const workspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(workspaceID);
        if (workspace === undefined) return;

        // Hide the view first, but don't let a failure here prevent the wiki server from stopping.
        try {
          await this.hideWorkspaceView(workspaceID);
        } catch (error) {
          logger.warn('hibernateWorkspace: hideWorkspaceView failed, continuing to stop wiki', { workspaceID, error });
        }

        if (isWikiWorkspace(workspace) && workspace.hibernateWhenUnused) {
          await this.hibernateWorkspaceView(workspaceID);
        }
      } finally {
        this.hibernatingWorkspaces.delete(workspaceID);
      }
    })();
    this.hibernatingWorkspaces.set(workspaceID, promise);
    return promise;
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
      logger.error('setActiveWorkspaceView error', {
        function: 'clearActiveWorkspaceView',
        error,
      });
      throw error;
    }
    if (isWikiWorkspace(activeWorkspace) && activeWorkspace.hibernateWhenUnused) {
      await this.hibernateWorkspaceView(activeWorkspace.id);
    }
  }

  public async removeWorkspaceView(workspaceID: string): Promise<void> {
    container.get<IViewService>(serviceIdentifier.View).destroyAllViewsOfWorkspace(workspaceID);
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
    logger.info(`[test-id-WIKI_WORKER_RESTARTING] Workspace ${workspaceToRestart.id} restart initiated`);
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
      logger.warn('skip because workspaceDidFailLoad', { function: 'restartWorkspaceViewService' });
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
          [WindowNames.main, WindowNames.tidgiMiniWindow].map(async (windowName) => {
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
   * Force-show the active workspace view and rebuild the menu.  Called when a window
   * transitions from hidden/background to visible so the Chromium compositor is guaranteed
   * to paint the WebContentsView.
   *
   * Intentionally does NOT call `realignActiveWorkspace()` afterwards:
   * `showWorkspaceView` → `showView` already sets the correct bounds via `getViewBounds`.
   * A subsequent `realignView` would duplicate setBounds and run after `showView`'s
   * `webContents.focus()`, potentially interfering with focus state.
   */
  public async refreshActiveWorkspaceView(): Promise<void> {
    logger.info('[test-id-REFRESH_ACTIVE_VIEW_START]');
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const activeWorkspace = await workspaceService.getActiveWorkspace();
    if (activeWorkspace !== undefined) {
      await this.showWorkspaceView(activeWorkspace.id);
    }
    try {
      await container.get<IMenuService>(serviceIdentifier.MenuService).buildMenu();
    } catch (error) {
      // Log but don't rethrow — this is called from the 'show' window event handler
      // (fire-and-forget context) so a rethrow would produce an unhandled rejection.
      logger.error('refreshActiveWorkspaceView buildMenu error', {
        function: 'refreshActiveWorkspaceView',
        error,
      });
    }
    logger.info('[test-id-REFRESH_ACTIVE_VIEW_DONE]');
  }

  public async realignActiveWorkspace(id?: string): Promise<void> {
    // this function only call browserView.setBounds
    // do not attempt to recall browserView.webContents.focus()
    // as it breaks page focus (cursor, scroll bar not visible)
    await this.realignActiveWorkspaceView(id);
    try {
      await container.get<IMenuService>(serviceIdentifier.MenuService).buildMenu();
    } catch (error) {
      logger.error('realignActiveWorkspace buildMenu error', {
        function: 'realignActiveWorkspace',
        error,
      });
      throw error;
    }
  }

  private async realignActiveWorkspaceView(id?: string): Promise<void> {
    const workspaceToRealign = id === undefined
      ? await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace()
      : await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(id);
    logger.debug('activeWorkspace.id', {
      workspaceId: workspaceToRealign?.id ?? 'undefined',
      stack: new Error('stack').stack?.replace('Error:', ''),
      function: 'realignActiveWorkspaceView',
    });
    if (workspaceToRealign && isWikiWorkspace(workspaceToRealign) && workspaceToRealign.isSubWiki) {
      logger.debug('skip because subwiki; realign main wiki instead', { workspaceId: workspaceToRealign.id, function: 'realignActiveWorkspaceView' });
      if (workspaceToRealign.mainWikiID) {
        await this.realignActiveWorkspaceView(workspaceToRealign.mainWikiID);
      }
      return;
    }
    const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
    const tidgiMiniWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.tidgiMiniWindow);

    logger.info(
      `realignActiveWorkspaceView: id ${workspaceToRealign?.id ?? 'undefined'}`,
    );
    if (workspaceToRealign === undefined) {
      logger.warn('realignActiveWorkspaceView: no active workspace');
      return;
    }
    if (mainWindow === undefined && tidgiMiniWindow === undefined) {
      logger.warn('realignActiveWorkspaceView: no active window');
      return;
    }
    const tasks = [];
    if (mainWindow === undefined) {
      logger.warn(`realignActiveWorkspaceView: no mainBrowserViewWebContent, skip main window for ${workspaceToRealign.id}.`);
    } else {
      tasks.push(container.get<IViewService>(serviceIdentifier.View).realignView(workspaceToRealign.id, WindowNames.main));
      logger.debug(`realignActiveWorkspaceView: realign main window for ${workspaceToRealign.id}.`);
    }
    if (tidgiMiniWindow === undefined) {
      logger.info(`realignActiveWorkspaceView: no tidgiMiniWindowBrowserViewWebContent, skip tidgi mini window for ${workspaceToRealign.id}.`);
    } else {
      // For tidgi mini window, decide which workspace to show based on preferences
      const { shouldSync, targetWorkspaceId } = await getTidgiMiniWindowTargetWorkspace(workspaceToRealign.id);

      if (shouldSync) {
        tasks.push(container.get<IViewService>(serviceIdentifier.View).realignView(workspaceToRealign.id, WindowNames.tidgiMiniWindow));
      } else if (targetWorkspaceId) {
        // Fixed workspace mode — always realign the fixed workspace regardless of which one main window is realigning
        tasks.push(container.get<IViewService>(serviceIdentifier.View).realignView(targetWorkspaceId, WindowNames.tidgiMiniWindow));
      }
    }
    await Promise.all(tasks);
  }

  private async hideWorkspaceView(idToDeactivate: string): Promise<void> {
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const tasks: Promise<void>[] = [];

    // Always hide main window view
    tasks.push(viewService.hideView(idToDeactivate, WindowNames.main));

    // For tidgi mini window, only hide if syncing with main window OR if this is the fixed workspace
    const tidgiMiniWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.tidgiMiniWindow);
    if (tidgiMiniWindow !== undefined) {
      const { shouldSync, targetWorkspaceId } = await getTidgiMiniWindowTargetWorkspace(idToDeactivate);
      if (shouldSync || idToDeactivate === targetWorkspaceId) {
        tasks.push(viewService.hideView(idToDeactivate, WindowNames.tidgiMiniWindow));
      }
    }
    await Promise.all(tasks);
  }

  /**
   * Show a workspace's views in the appropriate windows.
   * Handles mini-window policy (sync / fixed / none) so ViewService doesn't need to.
   */
  private async showWorkspaceView(workspaceID: string): Promise<void> {
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const workspace = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(workspaceID);
    if (workspace === undefined) {
      logger.error('showWorkspaceView: workspace not found', { workspaceID });
      return;
    }

    // If view doesn't exist yet, create it; otherwise just show it
    const existingMainView = viewService.getView(workspaceID, WindowNames.main);
    if (existingMainView === undefined) {
      await viewService.addView(workspace, WindowNames.main);
    } else {
      await viewService.showView(workspaceID, WindowNames.main);
    }

    // Handle tidgi mini window
    const tidgiMiniWindowEnabled = await this.preferenceService.get('tidgiMiniWindow');
    if (!tidgiMiniWindowEnabled) return;

    const { shouldSync, targetWorkspaceId } = await getTidgiMiniWindowTargetWorkspace(workspaceID);
    if (shouldSync) {
      const existingMiniView = viewService.getView(workspaceID, WindowNames.tidgiMiniWindow);
      if (existingMiniView === undefined) {
        await viewService.addView(workspace, WindowNames.tidgiMiniWindow);
      } else {
        await viewService.showView(workspaceID, WindowNames.tidgiMiniWindow);
      }
    } else if (targetWorkspaceId) {
      // Fixed workspace — show it if this IS the fixed workspace
      if (workspaceID === targetWorkspaceId) {
        const existingMiniView = viewService.getView(targetWorkspaceId, WindowNames.tidgiMiniWindow);
        if (existingMiniView === undefined) {
          const targetWs = await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(targetWorkspaceId);
          if (targetWs) await viewService.addView(targetWs, WindowNames.tidgiMiniWindow);
        } else {
          await viewService.showView(targetWorkspaceId, WindowNames.tidgiMiniWindow);
        }
      }
      // Otherwise mini window keeps showing the fixed workspace — no change needed
    }
  }
}
