import { app, dialog } from 'electron';
import { injectable, inject } from 'inversify';

import { autoUpdater, UpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'builder-util-runtime';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Window } from '@services/windows';
import { WindowNames } from '@services/windows/WindowProperties';

@injectable()
export class Updater {
  constructor(@inject(serviceIdentifiers.Window) private readonly windowService: Window) {}

  init(): void {
    (global as any).updateSilent = true;
    global.updaterObj = {};
    this.configAutoUpdater();
  }

  configAutoUpdater(): void {
    autoUpdater.on('checking-for-update', () => {
      global.updaterObj = {
        status: 'checking-for-update',
      };
      // TODO: sendToAllWindows
      // sendToAllWindows('update-updater', global.updaterObj);
      // TODO: make createMenu a service that receive contribution registering from other services
      // createMenu();
    });
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (!(global as any).updateSilent && mainWindow !== undefined) {
        void dialog.showMessageBox(mainWindow, {
          title: 'An Update is Available',
          message: 'There is an available update. It is being downloaded. We will let you know when it is ready.',
          buttons: ['OK'],
          cancelId: 0,
          defaultId: 0,
        });
        (global as any).updateSilent = true;
      }
      global.updaterObj = {
        status: 'update-available',
        info,
      };
      // TODO: sendToAllWindows
      // sendToAllWindows('update-updater', global.updaterObj);
      // TODO: make createMenu a service
      // createMenu();
    });
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (!(global as any).updateSilent && mainWindow !== undefined) {
        dialog
          .showMessageBox(mainWindow, {
            title: 'No Updates',
            message: 'There are currently no updates available.',
            buttons: ['OK'],
            cancelId: 0,
            defaultId: 0,
          })
          .catch(console.log);
        (global as any).updateSilent = true;
      }
      global.updaterObj = {
        status: 'update-not-available',
        info,
      };
      // TODO: sendToAllWindows
      // sendToAllWindows('update-updater', global.updaterObj);
      // TODO: make createMenu a service
      // createMenu();
    });
    autoUpdater.on('error', (error: Error) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (!(global as any).updateSilent && mainWindow !== undefined) {
        dialog
          // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'BrowserWindow | undefined' is no... Remove this comment to see the full error message
          .showMessageBox(mainWindow, {
            title: 'Failed to Check for Updates',
            message: 'Failed to check for updates. Please check your Internet connection.',
            buttons: ['OK'],
            cancelId: 0,
            defaultId: 0,
          })
          .catch(console.log);
        (global as any).updateSilent = true;
      }
      // sendToAllWindows('log', error);
      global.updaterObj = {
        status: 'error',
        info: error,
      };
      // TODO: sendToAllWindows
      // sendToAllWindows('update-updater', global.updaterObj);
      // TODO: make createMenu a service
      // createMenu();
    });
    autoUpdater.on('update-cancelled', () => {
      global.updaterObj = {
        status: 'update-cancelled',
      };
      // TODO: sendToAllWindows
      // sendToAllWindows('update-updater', global.updaterObj);
      // TODO: make createMenu a service
      // createMenu();
    });
    autoUpdater.on('download-progress', (progressObject: ProgressInfo) => {
      global.updaterObj = {
        status: 'download-progress',
        info: progressObject,
      };
      // TODO: sendToAllWindows
      // sendToAllWindows('update-updater', global.updaterObj);
      // TODO: make createMenu a service
      // createMenu();
    });
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      const mainWindow = this.windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        global.updaterObj = {
          status: 'update-downloaded',
          info,
        };
        // TODO: sendToAllWindows
        // sendToAllWindows('update-updater', global.updaterObj);
        // TODO: make createMenu a service
        // createMenu();
        const dialogOptions = {
          type: 'info',
          buttons: ['Restart', 'Later'],
          title: 'Application Update',
          detail: `A new version (${info.version}) has been downloaded. Restart the application to apply the updates.`,
          cancelId: 1,
        };
        dialog
          // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'BrowserWindow | undefined' is no... Remove this comment to see the full error message
          .showMessageBox(mainWindow, dialogOptions)
          .then(({ response }) => {
            if (response === 0) {
              // Fix autoUpdater.quitAndInstall() does not quit immediately
              // https://github.com/electron/electron/issues/3583
              // https://github.com/electron-userland/electron-builder/issues/1604
              setImmediate(() => {
                app.removeAllListeners('window-all-closed');
                const mainWindow = this.windowService.get(WindowNames.main);
                if (mainWindow !== undefined) {
                  (mainWindow as any).forceClose = true;
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
