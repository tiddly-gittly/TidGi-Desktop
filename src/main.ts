import 'reflect-metadata';
import fs from 'fs-extra';
import { ipcMain, protocol, powerMonitor, app } from 'electron';
import settings from 'electron-settings';
import { autoUpdater } from 'electron-updater';
import unhandled from 'electron-unhandled';
import { openNewGitHubIssue, debugInfo } from 'electron-util';

import { clearMainBindings } from '@services/libs/i18n/i18nMainBindings';
import { buildLanguageMenu } from '@services/libs/i18n/buildLanguageMenu';
import { MainChannel } from '@/constants/channels';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { initRendererI18NHandler } from '@services/libs/i18n';

import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';
import { bindServiceAndProxy } from '@services/libs/bindServiceAndProxy';

import { IPreferenceService } from './services/preferences/interface';
import { IWikiService } from './services/wiki/interface';
import { IWindowService } from './services/windows/interface';
import { IWorkspaceViewService } from './services/workspacesView/interface';
import path from 'path';

const gotTheLock = app.requestSingleInstanceLock();

logger.info('App booting');

if (!gotTheLock) {
  logger.info('Quitting dut to we only allow one instance to run.');
  console.info('Quitting dut to we only allow one instance to run.');
  app.quit();
} else {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'http', privileges: { standard: true } },
    { scheme: 'https', privileges: { standard: true } },
    { scheme: 'mailto', privileges: { standard: true } },
  ]);
  bindServiceAndProxy();
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    const mainWindow = windowService.get(WindowNames.main);
    if (mainWindow !== undefined) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
  // make sure "Settings" file exists
  // if not, ignore this chunk of code
  // as using electron-settings before app.on('ready') and "Settings" is created
  // would return error
  // https://github.com/nathanbuchar/electron-settings/issues/111
  if (fs.existsSync(settings.file())) {
    const useHardwareAcceleration = preferenceService.get('useHardwareAcceleration');
    if (!useHardwareAcceleration) {
      app.disableHardwareAcceleration();
    }
    const ignoreCertificateErrors = preferenceService.get('ignoreCertificateErrors');
    if (ignoreCertificateErrors) {
      // https://www.electronjs.org/docs/api/command-line-switches
      app.commandLine.appendSwitch('ignore-certificate-errors');
    }
  }
  let commonInitFinished = false;
  /** mock app.whenReady */
  ipcMain.once(MainChannel.commonInitFinished, () => {
    commonInitFinished = true;
  });
  /**
   * Make sure some logic only run after window and services are truly ready
   */
  const whenCommonInitFinished = async (): Promise<void> => {
    if (commonInitFinished) {
      return await Promise.resolve();
    }
    return await new Promise((resolve) => {
      ipcMain.once(MainChannel.commonInitFinished, () => {
        commonInitFinished = true;
        resolve();
      });
    });
  };
  const commonInit = async (): Promise<void> => {
    await initRendererI18NHandler();

    // eslint-disable-next-line promise/catch-or-return
    await app.whenReady();
    if (
      !protocol.registerFileProtocol('file', (request, callback) => {
        const pathname = decodeURIComponent(request.url.replace('file:///', ''));
        if (path.isAbsolute(pathname) ? fs.existsSync(pathname) : fs.existsSync(`/${pathname}`)) {
          callback(pathname);
        } else {
          // on production, __dirname will be in .webpack/main
          const filePath = path.join(app.getAppPath(), '.webpack', 'renderer', pathname);
          callback(filePath);
        }
      })
    ) {
      logger.error('Failed to registerFileProtocol file:///');
      app.quit();
    }
    await windowService.open(WindowNames.main);
    await workspaceViewService.initializeAllWorkspaceView();
    buildLanguageMenu();

    ipcMain.emit('request-update-pause-notifications-info');
    // Fix webview is not resized automatically
    // when window is maximized on Linux
    // https://github.com/atomery/webcatalog/issues/561
    // run it here not in mainWindow.createAsync()
    // because if the `mainWindow` is maximized or minimized
    // before the workspaces's BrowserView fully loaded
    // error will occur
    // see https://github.com/atomery/webcatalog/issues/637
    // eslint-disable-next-line promise/always-return
    if (process.platform === 'linux') {
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        const handleMaximize = (): void => {
          // getContentSize is not updated immediately
          // try once after 0.2s (for fast computer), another one after 1s (to be sure)
          setTimeout(() => {
            workspaceViewService.realignActiveWorkspace();
          }, 200);
          setTimeout(() => {
            workspaceViewService.realignActiveWorkspace();
          }, 1000);
        };
        mainWindow.on('maximize', handleMaximize);
        mainWindow.on('unmaximize', handleMaximize);
      }
    }
    // trigger whenTrulyReady
    ipcMain.emit(MainChannel.commonInitFinished);
  };

  app.on('ready', () => {
    autoUpdater.allowPrerelease = preferenceService.get('allowPrerelease');
    autoUpdater.logger = logger;
    whenCommonInitFinished()
      // eslint-disable-next-line promise/always-return
      .then(() => {
        ipcMain.emit('request-check-for-updates', undefined, true);
      })
      .catch((error) => console.error(error));
    powerMonitor.on('shutdown', () => {
      app.quit();
    });
    void commonInit();
  });
  app.on(MainChannel.windowAllClosed, () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  app.on('activate', () => {
    const mainWindow = windowService.get(WindowNames.main);
    if (mainWindow === undefined) {
      void commonInit();
    } else {
      mainWindow.show();
    }
  });
  app.on(
    'before-quit',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (): Promise<void> => {
      logger.info('Quitting worker threads and watcher.');
      await Promise.all([wikiService.stopAllWiki(), wikiService.stopWatchAllWiki()]);
      logger.info('Worker threads and watchers all terminated.');
      logger.info('Quitting I18N server.');
      clearMainBindings(ipcMain);
      logger.info('Quitted I18N server.');
      // https://github.com/atom/electron/issues/444#issuecomment-76492576
      if (process.platform === 'darwin') {
        const mainWindow = windowService.get(WindowNames.main);
        if (mainWindow !== undefined) {
          logger.info('App force quit on MacOS');
          windowService.updateWindowMeta(WindowNames.main, { forceClose: true });
        }
      }
      app.exit(0);
    },
  );
  app.on('quit', () => {
    logger.info('App quit');
  });
}

unhandled({
  showDialog: true,
  logger: logger.error.bind(logger),
  reportButton: (error) => {
    openNewGitHubIssue({
      user: 'TiddlyGit Desktop User',
      repo: 'tiddly-gittly/TiddlyGit-Desktop',
      body: `\`\`\`\n${error.stack ?? 'No error.stack'}\n\`\`\`\n\n---\n\n${debugInfo()}`,
    });
  },
});
