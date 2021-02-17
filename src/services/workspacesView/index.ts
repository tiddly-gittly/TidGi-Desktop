import { app, ipcMain, session, dialog } from 'electron';
import { injectable, inject } from 'inversify';
import { delay } from 'bluebird';

import serviceIdentifier from '@services/serviceIdentifier';
import i18n from '@services/libs/i18n';
import type { IViewService } from '@services/view/interface';
import type { IWorkspaceService, IWorkspace } from '@services/workspaces/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IMenuService } from '@services/menu/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { WindowChannel } from '@/constants/channels';
import { IPreferenceService } from '@services/preferences/interface';
import { logger } from '@services/libs/log';
import { IAuthenticationService } from '@services/auth/interface';
import { IGitService } from '@services/git/interface';
import { IWorkspaceViewService } from './interface';
import { lazyInject } from '@services/container';

@injectable()
export class WorkspaceView implements IWorkspaceViewService {
  @lazyInject(serviceIdentifier.Authentication) private readonly authService!: IAuthenticationService;
  @lazyInject(serviceIdentifier.View) private readonly viewService!: IViewService;
  @lazyInject(serviceIdentifier.Git) private readonly gitService!: IGitService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;

  constructor() {
    this.registerMenu();
  }

  /**
   * Prepare workspaces on startup
   */
  public async initializeAllWorkspaceView(): Promise<void> {
    const workspaces = this.workspaceService.getWorkspaces();
    for (const workspaceID in workspaces) {
      const workspace = workspaces[workspaceID];
      if ((this.preferenceService.get('hibernateUnusedWorkspacesAtLaunch') || workspace.hibernateWhenUnused) && !workspace.active) {
        if (!workspace.hibernated) {
          await this.workspaceService.update(workspaceID, { hibernated: true });
        }
        return;
      }
      const mainWindow = this.windowService.get(WindowNames.main);
      if (mainWindow === undefined) return;
      await this.viewService.addView(mainWindow, workspace);
      try {
        const userInfo = this.authService.get('authing');
        const { name: wikiPath, gitUrl: githubRepoUrl, isSubWiki } = workspace;
        // wait for main wiki's watch-fs plugin to be fully initialized
        // and also wait for wiki BrowserView to be able to receive command
        // eslint-disable-next-line global-require
        let workspaceMetadata = this.workspaceService.getMetaData(workspaceID);
        if (!isSubWiki) {
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          while (!workspaceMetadata.didFailLoadErrorMessage && !workspaceMetadata.isLoading) {
            // eslint-disable-next-line no-await-in-loop
            await delay(500);
            workspaceMetadata = this.workspaceService.getMetaData(workspaceID);
          }
        }
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!isSubWiki && !workspaceMetadata.didFailLoadErrorMessage?.length && userInfo) {
          await this.gitService.commitAndSync(wikiPath, githubRepoUrl, userInfo);
        }
      } catch {
        logger.warning(`Can't sync at wikiStartup()`);
      }
    }
  }

  public async openUrlInWorkspace(url: string, id: string): Promise<void> {
    if (typeof id === 'string' && id.length > 0) {
      // if id is defined, switch to that workspace
      await this.setActiveWorkspaceView(id);
      this.menuService.buildMenu();
      // load url in the current workspace
      const activeWorkspace = this.workspaceService.getActiveWorkspace();
      if (activeWorkspace !== undefined) {
        await this.loadURL(url, activeWorkspace.id);
      }
    }
  }

  private registerMenu(): void {
    const hasWorkspaces = this.workspaceService.countWorkspaces() > 0;
    this.menuService.insertMenu(
      'window',
      [
        {
          label: 'Developer Tools',
          submenu: [
            {
              label: 'Open Developer Tools of Active Workspace',
              accelerator: 'CmdOrCtrl+Option+I',
              click: () => this.viewService.getActiveBrowserView()?.webContents?.openDevTools(),
              enabled: hasWorkspaces,
            },
          ],
        },
      ],
      'close',
    );
  }

  public async createWorkspaceView(workspaceOptions: IWorkspace): Promise<void> {
    const newWorkspace = await this.workspaceService.create(workspaceOptions);
    const mainWindow = this.windowService.get(WindowNames.main);
    if (mainWindow !== undefined) {
      if (!workspaceOptions.isSubWiki) {
        await this.workspaceService.setActiveWorkspace(newWorkspace.id);
        await this.viewService.setActiveView(mainWindow, newWorkspace.id);
      }
      await this.viewService.addView(mainWindow, newWorkspace);
    }

    if (typeof workspaceOptions.picturePath === 'string') {
      await this.workspaceService.setWorkspacePicture(newWorkspace.id, workspaceOptions.picturePath);
    }
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
    const workspace = this.workspaceService.get(id);
    if (mainWindow !== undefined && workspace !== undefined) {
      await this.viewService.addView(mainWindow, workspace);
      await this.workspaceService.update(id, {
        hibernated: false,
      });
    }
  }

  public async hibernateWorkspaceView(id: string): Promise<void> {
    if (this.workspaceService.get(id)?.active !== true) {
      this.viewService.hibernateView(id);
      await this.workspaceService.update(id, {
        hibernated: true,
      });
    }
  }

  public async setActiveWorkspaceView(id: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    const oldActiveWorkspace = this.workspaceService.getActiveWorkspace();

    if (mainWindow !== undefined && oldActiveWorkspace !== undefined) {
      await this.workspaceService.setActiveWorkspace(id);
      await this.viewService.setActiveView(mainWindow, id);

      // hibernate old view
      if (oldActiveWorkspace?.hibernateWhenUnused && oldActiveWorkspace.id !== id) {
        await this.hibernateWorkspaceView(oldActiveWorkspace.id);
      }
    }
  }

  public async removeWorkspaceView(id: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    // if there's only one workspace left, clear all
    if (this.workspaceService.countWorkspaces() === 1) {
      if (mainWindow !== undefined) {
        // eslint-disable-next-line unicorn/no-null
        mainWindow.setBrowserView(null);
        mainWindow.setTitle(app.name);
        this.windowService.sendToAllWindows(WindowChannel.updateTitle, '');
      }
    } else if (this.workspaceService.countWorkspaces() > 1 && this.workspaceService.get(id)?.active === true) {
      const previousWorkspace = this.workspaceService.getPreviousWorkspace(id);
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
    const workspaces = this.workspaceService.getWorkspaces();
    await Promise.all(Object.keys(workspaces).map(async (id) => await session.fromPartition(`persist:${id}`).clearStorageData()));

    // shared session
    await session.fromPartition('persist:shared').clearStorageData();
  }

  public async loadURL(url: string, id: string | undefined = this.workspaceService.getActiveWorkspace()?.id): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    if (mainWindow !== undefined && id !== undefined) {
      await this.workspaceService.setActiveWorkspace(id);
      await this.viewService.setActiveView(mainWindow, id);

      const browserView = mainWindow.getBrowserView();
      if (browserView !== null) {
        browserView.webContents.focus();
        await browserView.webContents.loadURL(url);
      }
    }
  }

  /**
   * Seems this is for relocating BrowserView in the electron window
   * // TODO: why we need this?
   */
  public realignActiveWorkspace(): void {
    // this function only call browserView.setBounds
    // do not attempt to recall browserView.webContents.focus()
    // as it breaks page focus (cursor, scroll bar not visible)
    this.realignActiveWorkspaceView();
    // TODO: why we need to rebuild menu?
    this.menuService.buildMenu();
  }

  private realignActiveWorkspaceView(): void {
    const activeWorkspace = this.workspaceService.getActiveWorkspace();
    const mainWindow = this.windowService.get(WindowNames.main);
    if (activeWorkspace !== undefined && mainWindow !== undefined) {
      this.viewService.realignActiveView(mainWindow, activeWorkspace.id);
    }
  }
}
