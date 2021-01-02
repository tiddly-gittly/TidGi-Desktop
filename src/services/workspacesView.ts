import { app, session } from 'electron';
import { injectable, inject } from 'inversify';

import serviceIdentifiers from '@services/serviceIdentifier';
import { View } from '@services/view';
import { Workspace } from '@services/workspaces';
import { Window } from '@services/windows';
import sendToAllWindows from './libs/send-to-all-windows';
import { IWorkspace } from '@/services/types';
import { WindowNames } from '@/services/windows/WindowProperties';

/**
 * Deal with operations that needs to create a workspace and a browserView at once
 */
@injectable()
export class WorkspaceView {
  constructor(
    @inject(serviceIdentifiers.View) private readonly viewService: View,
    @inject(serviceIdentifiers.Workspace) private readonly workspaceService: Workspace,
    @inject(serviceIdentifiers.Window) private readonly windowService: Window,
  ) {}

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
        sendToAllWindows('update-title', '');
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

  public async clearBrowsingData(): Promise<void> {
    await session.defaultSession.clearStorageData();
    const workspaces = this.workspaceService.getWorkspaces();
    await Promise.all(Object.keys(workspaces).map(async (id) => await session.fromPartition(`persist:${id}`).clearStorageData()));

    // shared session
    await session.fromPartition('persist:shared').clearStorageData();
  }

  public async loadURL(url: string, id: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    if (mainWindow !== undefined) {
      await this.workspaceService.setActiveWorkspace(id);
      await this.viewService.setActiveView(mainWindow, id);

      const browserView = mainWindow.getBrowserView();
      if (browserView !== null) {
        browserView.webContents.focus();
        await browserView.webContents.loadURL(url);
      }
    }
  }

  public realignActiveWorkspaceView(): void {
    const activeWorkspace = this.workspaceService.getActiveWorkspace();
    const mainWindow = this.windowService.get(WindowNames.main);
    if (activeWorkspace !== undefined && mainWindow !== undefined) {
      this.viewService.realignActiveView(mainWindow, activeWorkspace.id);
    }
  }
}
