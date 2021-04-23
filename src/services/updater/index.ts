/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { app, dialog, shell } from 'electron';
import { injectable } from 'inversify';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'builder-util-runtime';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { lazyInject } from '@services/container';
import { MainChannel } from '@/constants/channels';
import { IUpdaterService, IUpdaterMetaData } from './interface';
import { IMenuService } from '@services/menu/interface';
import { logger } from '@services/libs/log';
import { BehaviorSubject } from 'rxjs';

// TODO: use electron-forge 's auto update solution， maybe see https://headspring.com/2020/09/24/building-signing-and-publishing-electron-forge-applications-for-windows/
@injectable()
export class Updater implements IUpdaterService {
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;

  private updateSilent = true;
  private updaterMetaData = {} as IUpdaterMetaData;
  public updaterMetaData$: BehaviorSubject<IUpdaterMetaData>;

  public constructor() {
    this.updateSilent = true;
    this.configAutoUpdater();
    this.updaterMetaData$ = new BehaviorSubject<IUpdaterMetaData>(this.updaterMetaData);
  }

  private updateUpdaterSubject(): void {
    this.updaterMetaData$.next(this.updaterMetaData);
  }

  private setMetaData(newUpdaterMetaData: IUpdaterMetaData): void {
    this.updaterMetaData = {
      ...this.updaterMetaData,
      ...newUpdaterMetaData,
    };
    this.updateUpdaterSubject();
    void this.menuService.buildMenu();
  }

  public async checkForUpdates(isSilent: boolean): Promise<void> {
    // https://github.com/electron-userland/electron-builder/issues/4028
    if (!autoUpdater.isUpdaterActive()) {
      return;
    }
    // https://github.com/atomery/webcatalog/issues/634
    // https://github.com/electron-userland/electron-builder/issues/4046
    // disable updater if user is using AppImageLauncher
    if (process.platform === 'linux' && process.env.DESKTOPINTEGRATION === 'AppImageLauncher') {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (mainWindow === undefined) return;
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'error',
        message: 'Updater is incompatible with AppImageLauncher. Please uninstall AppImageLauncher or download new updates manually from our website.',
        buttons: ['Learn More', 'Go to Website', 'OK'],
        cancelId: 2,
        defaultId: 2,
      });

      // eslint-disable-next-line promise/always-return
      if (response === 0) {
        await shell.openExternal('https://github.com/electron-userland/electron-builder/issues/4046');
      } else if (response === 1) {
        await shell.openExternal('http://singleboxapp.com/');
      }

      // eslint-disable-next-line no-useless-return
      return;
    }
    // TODO: enable updater later, if I have time remove all untyped global.xxx
    // restart & apply updates
    // if (this.updaterMetaData && this.updaterMetaData.status === 'update-downloaded') {
    //   setImmediate(() => {
    //     app.removeAllListeners(MainChannel.windowAllClosed);
    //     if (mainWindow.get() !== undefined) {
    //       (mainWindow.get() as any).forceClose = true;
    //       mainWindow.get().close();
    //     }
    //     autoUpdater.quitAndInstall(false);
    //   });
    // }
    // // check for updates
    // this.updateSilent = Boolean(isSilent);
    // autoUpdater.checkForUpdates();
  }

  private configAutoUpdater(): void {
    autoUpdater.on('checking-for-update', () => {
      this.setMetaData({
        status: 'checking-for-update',
      });
    });
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (!this.updateSilent && mainWindow !== undefined) {
        void dialog.showMessageBox(mainWindow, {
          title: 'An Update is Available',
          message: 'There is an available update. It is being downloaded. We will let you know when it is ready.',
          buttons: ['OK'],
          cancelId: 0,
          defaultId: 0,
        });
        this.updateSilent = true;
      }
      this.setMetaData({
        status: 'update-available',
        info,
      });
    });
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (!this.updateSilent && mainWindow !== undefined) {
        dialog
          .showMessageBox(mainWindow, {
            title: 'No Updates',
            message: 'There are currently no updates available.',
            buttons: ['OK'],
            cancelId: 0,
            defaultId: 0,
          })
          .catch(console.log);
        this.updateSilent = true;
      }
      this.setMetaData({
        status: 'update-not-available',
        info,
      });
    });
    autoUpdater.on('error', (error: Error) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (!this.updateSilent && mainWindow !== undefined) {
        dialog
          .showMessageBox(mainWindow, {
            title: 'Failed to Check for Updates',
            message: 'Failed to check for updates. Please check your Internet connection.',
            buttons: ['OK'],
            cancelId: 0,
            defaultId: 0,
          })
          .catch(console.log);
        this.updateSilent = true;
      }
      logger.error(error);
      this.setMetaData({
        status: 'error',
        info: error,
      });
    });
    autoUpdater.on('update-cancelled', () => {
      this.setMetaData({
        status: 'update-cancelled',
      });
    });
    autoUpdater.on('download-progress', (progressObject: ProgressInfo) => {
      this.setMetaData({
        status: 'download-progress',
        info: progressObject,
      });
    });
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        this.setMetaData({
          status: 'update-downloaded',
          info,
        });
        dialog
          .showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['Restart', 'Later'],
            title: 'Application Update',
            message: `A new version (${info.version}) has been downloaded. Restart the application to apply the updates.`,
            cancelId: 1,
          })
          .then(({ response }) => {
            if (response === 0) {
              // Fix autoUpdater.quitAndInstall() does not quit immediately
              // https://github.com/electron/electron/issues/3583
              // https://github.com/electron-userland/electron-builder/issues/1604
              setImmediate(() => {
                app.removeAllListeners(MainChannel.windowAllClosed);
                const mainWindow = this.windowService.get(WindowNames.main);
                if (mainWindow !== undefined) {
                  this.windowService.updateWindowMeta(WindowNames.main, { forceClose: true });
                  mainWindow.close();
                }
                autoUpdater.quitAndInstall(false);
              });
            }
          })
          .catch(console.log);
      }
    });
  }
}
