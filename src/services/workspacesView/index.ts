/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable unicorn/consistent-destructuring */
import { app, session, dialog } from 'electron';
import { injectable } from 'inversify';
import { delay, mapSeries } from 'bluebird';

import serviceIdentifier from '@services/serviceIdentifier';
import i18n from '@services/libs/i18n';
import type { IViewService } from '@services/view/interface';
import type { IWorkspaceService, IWorkspace, INewWorkspaceConfig } from '@services/workspaces/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IMenuService } from '@services/menu/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IPreferenceService } from '@services/preferences/interface';
import { logger } from '@services/libs/log';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IGitService } from '@services/git/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceViewService } from './interface';
import { lazyInject } from '@services/container';
import { SupportedStorageServices } from '@services/types';
import { WorkspaceFailedToLoadError } from './error';
import { WikiChannel } from '@/constants/channels';

@injectable()
export class WorkspaceView implements IWorkspaceViewService {
  @lazyInject(serviceIdentifier.Authentication) private readonly authService!: IAuthenticationService;
  @lazyInject(serviceIdentifier.View) private readonly viewService!: IViewService;
  @lazyInject(serviceIdentifier.Git) private readonly gitService!: IGitService;
  @lazyInject(serviceIdentifier.Wiki) private readonly wikiService!: IWikiService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;

  constructor() {
    void this.registerMenu();
  }

  public async initializeAllWorkspaceView(): Promise<void> {
    const workspacesList = await this.workspaceService.getWorkspacesAsList();
    await mapSeries(
      workspacesList.sort((a, b) => (a.isSubWiki && !b.isSubWiki ? 1 : -1)),
      async (workspace) => {
        this.wikiService.setWikiStartLockOn(workspace.wikiFolderLocation);
        await this.initializeWorkspaceView(workspace);
      },
    );
    this.wikiService.setAllWikiStartLockOff();
  }

  public async initializeWorkspaceView(workspace: IWorkspace): Promise<void> {
    // skip if workspace don't contains a valid tiddlywiki setup, this allows user to delete workspace later
    if ((await this.wikiService.checkWikiExist(workspace, { shouldBeMainWiki: !workspace.isSubWiki, showDialog: true })) !== true) {
      return;
    }
    if (((await this.preferenceService.get('hibernateUnusedWorkspacesAtLaunch')) || workspace.hibernateWhenUnused) && !workspace.active) {
      if (!workspace.hibernated) {
        await this.workspaceService.update(workspace.id, { hibernated: true });
      }
      return;
    }
    const mainWindow = this.windowService.get(WindowNames.main);
    if (mainWindow === undefined) {
      throw new Error(i18n.t(`Error.MainWindowMissing`));
    }
    if (workspace.storageService !== SupportedStorageServices.local) {
      const userInfo = this.authService.getStorageServiceUserInfo(workspace.storageService);
      if (userInfo === undefined) {
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
    await this.wikiService.wikiStartup(workspace);

    const userInfo = await this.authService.getStorageServiceUserInfo(workspace.storageService);
    const { wikiFolderLocation, gitUrl: githubRepoUrl, storageService, homeUrl } = workspace;

    // get sync process ready
    try {
      if (workspace.syncOnStartup && storageService !== SupportedStorageServices.local) {
        // check synced wiki should have githubRepoUrl
        if (typeof githubRepoUrl !== 'string') {
          throw new TypeError(`githubRepoUrl is undefined in initializeAllWorkspaceView when init ${wikiFolderLocation}`);
        }
        if (userInfo === undefined) {
          throw new TypeError(`userInfo is undefined in initializeAllWorkspaceView when init ${wikiFolderLocation}`);
        }
        // sync in non-blocking way
        void this.gitService.commitAndSync(wikiFolderLocation, githubRepoUrl, userInfo);
      }
    } catch (error) {
      logger.error(`Can't sync at wikiStartup(), ${(error as Error).message}\n${(error as Error).stack ?? 'no stack'}`);
    }

    // adding BrowserView for each workspace
    // skip view initialize if this is a sub wiki
    if (workspace.isSubWiki) {
      return;
    }
    // wait for main wiki's watch-fs plugin to be fully initialized
    // and also wait for wiki BrowserView to be able to receive command
    // eslint-disable-next-line global-require
    let workspaceMetadata = await this.workspaceService.getMetaData(workspace.id);
    await this.viewService.addView(mainWindow, workspace);
    let loadFailed = typeof workspaceMetadata.didFailLoadErrorMessage === 'string' && workspaceMetadata.didFailLoadErrorMessage.length > 0;
    // wait for main wiki webview loaded
    while (workspaceMetadata.isLoading !== false) {
      // eslint-disable-next-line no-await-in-loop
      await delay(500);
      workspaceMetadata = await this.workspaceService.getMetaData(workspace.id);
    }
    loadFailed = typeof workspaceMetadata.didFailLoadErrorMessage === 'string' && workspaceMetadata.didFailLoadErrorMessage.length > 0;
    if (loadFailed) {
      const latestWorkspaceData = await this.workspaceService.get(workspace.id);
      throw new WorkspaceFailedToLoadError(workspaceMetadata.didFailLoadErrorMessage!, latestWorkspaceData?.lastUrl ?? homeUrl);
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

  private async registerMenu(): Promise<void> {
    const hasWorkspaces = async (): Promise<boolean> => (await this.workspaceService.countWorkspaces()) > 0;

    await this.menuService.insertMenu('Workspaces', [
      {
        label: () => i18n.t('Menu.DeveloperToolsActiveWorkspace'),
        accelerator: 'CmdOrCtrl+Option+I',
        click: async () => (await this.viewService.getActiveBrowserView())?.webContents?.openDevTools(),
        enabled: async () => {
          const hasWorkspaces = (await this.workspaceService.countWorkspaces()) > 0;
          return hasWorkspaces;
        },
      },
    ]);
    await this.menuService.insertMenu('Wiki', [
      {
        label: () => i18n.t('Menu.PrintPage'),
        enabled: hasWorkspaces,
        click: async () => {
          const browserView = await this.viewService.getActiveBrowserView();
          if (browserView !== undefined) {
            void browserView.webContents.print();
          }
        },
      },
      {
        label: () => i18n.t('Menu.PrintActiveTiddler'),
        accelerator: 'CmdOrCtrl+Alt+Shift+P',
        click: async () => {
          await this.printTiddler();
        },
      },
    ]);
  }

  public async printTiddler(tiddlerName?: string): Promise<void> {
    const browserView = await this.viewService.getActiveBrowserView();
    if (browserView !== undefined) {
      browserView.webContents.send(WikiChannel.printTiddler, tiddlerName);
    }
  }

  public async createWorkspaceView(workspaceOptions: INewWorkspaceConfig): Promise<IWorkspace> {
    const newWorkspace = await this.workspaceService.create(workspaceOptions);
    const mainWindow = this.windowService.get(WindowNames.main);
    if (mainWindow !== undefined && !workspaceOptions.isSubWiki) {
      await this.workspaceService.setActiveWorkspace(newWorkspace.id);
      await this.viewService.addView(mainWindow, newWorkspace);
      await this.viewService.setActiveView(mainWindow, newWorkspace.id);
    }

    if (typeof workspaceOptions.picturePath === 'string') {
      await this.workspaceService.setWorkspacePicture(newWorkspace.id, workspaceOptions.picturePath);
    }
    return newWorkspace;
  }

  public async setWorkspaceView(id: string, workspaceOptions: IWorkspace): Promise<void> {
    await this.workspaceService.set(id, workspaceOptions);
    this.viewService.setViewsAudioPref();
    this.viewService.setViewsNotificationsPref();
  }

  public async setWorkspaceViews(workspaces: Record<string, IWorkspace>): Promise<void> {
    await this.workspaceService.setWorkspaces(workspaces);
    this.viewService.setViewsAudioPref();
    this.viewService.setViewsNotificationsPref();
  }

  public async wakeUpWorkspaceView(id: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    const workspace = await this.workspaceService.get(id);
    if (mainWindow !== undefined && workspace !== undefined) {
      await this.viewService.addView(mainWindow, workspace);
      await this.workspaceService.update(id, {
        hibernated: false,
      });
    }
  }

  public async hibernateWorkspaceView(id: string): Promise<void> {
    if ((await this.workspaceService.get(id))?.active !== true) {
      this.viewService.hibernateView(id);
      await this.workspaceService.update(id, {
        hibernated: true,
      });
    }
  }

  public async setActiveWorkspaceView(id: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    const oldActiveWorkspace = await this.workspaceService.getActiveWorkspace();

    if (mainWindow !== undefined && oldActiveWorkspace !== undefined) {
      await this.workspaceService.setActiveWorkspace(id);
      await this.viewService.setActiveView(mainWindow, id);

      // hibernate old view
      if (oldActiveWorkspace?.hibernateWhenUnused && oldActiveWorkspace.id !== id) {
        await this.hibernateWorkspaceView(oldActiveWorkspace.id);
      }
    }
    await this.realignActiveWorkspace();
  }

  public async removeWorkspaceView(id: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    // if there's only one workspace left, clear all
    if ((await this.workspaceService.countWorkspaces()) === 1) {
      if (mainWindow !== undefined) {
        // eslint-disable-next-line unicorn/no-null
        mainWindow.setBrowserView(null);
        mainWindow.setTitle(app.name);
      }
    } else if ((await this.workspaceService.countWorkspaces()) > 1 && (await this.workspaceService.get(id))?.active === true) {
      const previousWorkspace = await this.workspaceService.getPreviousWorkspace(id);
      if (previousWorkspace !== undefined) {
        await this.setActiveWorkspaceView(previousWorkspace.id);
      }
    }

    await this.workspaceService.remove(id);
    this.viewService.removeView(id);
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
        .then(({ response }) => {
          if (response === 0) {
            return this.clearBrowsingData();
          }
        })
        .catch(console.error);
    }
  }

  public async clearBrowsingData(): Promise<void> {
    await session.defaultSession.clearStorageData();
    const workspaces = await this.workspaceService.getWorkspaces();
    await Promise.all(Object.keys(workspaces).map(async (id) => await session.fromPartition(`persist:${id}`).clearStorageData()));

    // shared session
    await session.fromPartition('persist:shared').clearStorageData();
  }

  public async loadURL(url: string, id: string | undefined): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    const activeID = id ?? (await this.workspaceService.getActiveWorkspace())?.id;
    if (mainWindow !== undefined && activeID !== undefined) {
      await this.workspaceService.setActiveWorkspace(activeID);
      await this.viewService.setActiveView(mainWindow, activeID);

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
  public async realignActiveWorkspace(): Promise<void> {
    // this function only call browserView.setBounds
    // do not attempt to recall browserView.webContents.focus()
    // as it breaks page focus (cursor, scroll bar not visible)
    await this.realignActiveWorkspaceView();
    await this.menuService.buildMenu();
  }

  private async realignActiveWorkspaceView(): Promise<void> {
    const activeWorkspace = await this.workspaceService.getActiveWorkspace();
    const mainWindow = this.windowService.get(WindowNames.main);
    if (activeWorkspace !== undefined && mainWindow !== undefined) {
      void this.viewService.realignActiveView(mainWindow, activeWorkspace.id);
    }
  }
}
