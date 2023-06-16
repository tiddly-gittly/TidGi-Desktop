/* eslint-disable unicorn/prefer-top-level-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { uninstall } from './helpers/installV8Cache';
import 'source-map-support/register';
import 'reflect-metadata';
import './helpers/singleInstance';
import './helpers/configSetting';
import { app, ipcMain, powerMonitor, protocol } from 'electron';
import settings from 'electron-settings';
import unhandled from 'electron-unhandled';
import fs from 'fs-extra';

import { MainChannel } from '@/constants/channels';
import { isTest } from '@/constants/environment';
import { container } from '@services/container';
import { initRendererI18NHandler } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import { buildLanguageMenu } from '@services/menu/buildLanguageMenu';

import { bindServiceAndProxy } from '@services/libs/bindServiceAndProxy';
import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';

import { INativeService } from '@services/native/interface';
import { reportErrorToGithubWithTemplates } from '@services/native/reportError';
import type { IUpdaterService } from '@services/updater/interface';
import { IWikiService } from '@services/wiki/interface';
import { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import { isLinux, isMac } from './helpers/system';
import type { IPreferenceService } from './services/preferences/interface';
import type { IWindowService } from './services/windows/interface';
import type { IWorkspaceViewService } from './services/workspacesView/interface';

logger.info('App booting');

app.commandLine.appendSwitch('--disable-web-security');
protocol.registerSchemesAsPrivileged([
  { scheme: 'http', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'https', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'htmlString', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'mailto', privileges: { standard: true } },
]);
// TODO: handle workspace name + tiddler name in uri https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app
app.setAsDefaultProtocolClient('tidgi');
bindServiceAndProxy();
const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
const updaterService = container.get<IUpdaterService>(serviceIdentifier.Updater);
const wikiGitWorkspaceService = container.get<IWikiGitWorkspaceService>(serviceIdentifier.WikiGitWorkspace);
const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
const windowService = container.get<IWindowService>(serviceIdentifier.Window);
const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
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
  void preferenceService.get('useHardwareAcceleration').then((useHardwareAcceleration) => {
    if (!useHardwareAcceleration) {
      app.disableHardwareAcceleration();
    }
  });
  void preferenceService.get('ignoreCertificateErrors').then((ignoreCertificateErrors) => {
    if (ignoreCertificateErrors) {
      // https://www.electronjs.org/docs/api/command-line-switches
      app.commandLine.appendSwitch('ignore-certificate-errors');
    }
  });
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
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => {
    ipcMain.once(MainChannel.commonInitFinished, () => {
      commonInitFinished = true;
      resolve();
    });
  });
};
const commonInit = async (): Promise<void> => {
  // eslint-disable-next-line promise/catch-or-return
  await app.whenReady();
  if (!nativeService.registerFileProtocol()) {
    logger.error('Failed to registerFileProtocol file:///');
    app.quit();
  }
  // if user want a menubar, we create a new window for that
  await Promise.all([
    windowService.open(WindowNames.main),
    preferenceService.get('attachToMenubar').then(async (attachToMenubar) => {
      attachToMenubar && await windowService.open(WindowNames.menuBar);
    }),
  ]);
  // perform wiki startup and git sync for each workspace
  await workspaceViewService.initializeAllWorkspaceView();

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
  if (isLinux) {
    const mainWindow = windowService.get(WindowNames.main);
    if (mainWindow !== undefined) {
      const handleMaximize = (): void => {
        // getContentSize is not updated immediately
        // try once after 0.2s (for fast computer), another one after 1s (to be sure)
        setTimeout(() => {
          void workspaceViewService.realignActiveWorkspace();
        }, 200);
        setTimeout(() => {
          void workspaceViewService.realignActiveWorkspace();
        }, 1000);
      };
      mainWindow.on('maximize', handleMaximize);
      mainWindow.on('unmaximize', handleMaximize);
    }
  }
  // trigger whenTrulyReady
  ipcMain.emit(MainChannel.commonInitFinished);
};

/**
 * When loading wiki with https, we need to allow insecure https
 * // TODO: ask user upload certificate to be used by browser view
 * @url https://stackoverflow.com/questions/44658269/electron-how-to-allow-insecure-https
 */
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Prevent having error
  event.preventDefault();
  // and continue
  // eslint-disable-next-line n/no-callback-literal
  callback(true);
});
app.on('ready', async () => {
  whenCommonInitFinished()
    // eslint-disable-next-line promise/always-return
    .then(async () => {
      buildLanguageMenu();
      if (await preferenceService.get('syncBeforeShutdown')) {
        wikiGitWorkspaceService.registerSyncBeforeShutdown();
      }
      await updaterService.checkForUpdates();
    })
    .catch((error) => {
      console.error(error);
    });
  powerMonitor.on('shutdown', () => {
    app.quit();
  });
  await initRendererI18NHandler();
  await commonInit();
});
app.on(MainChannel.windowAllClosed, () => {
  // prevent quit on MacOS. But also quit if we are in test.
  if (!isMac || isTest) {
    app.quit();
  }
});
app.on('activate', async () => {
  await windowService.open(WindowNames.main);
});
app.on(
  'before-quit',
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (): Promise<void> => {
    logger.info('App before-quit');
    // https://github.com/atom/electron/issues/444#issuecomment-76492576
    if (isMac) {
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        logger.info('App force quit on MacOS, ask window not preventDefault');
        await windowService.updateWindowMeta(WindowNames.main, { forceClose: true });
      }
    }
    await wikiService.stopAllWiki();
    app.exit(0);
  },
);
app.on('quit', () => {
  uninstall?.uninstall();
  logger.info('App quit');
  logger.close();
});

if (!isTest) {
  unhandled({
    showDialog: true,
    logger: logger.error.bind(logger),
    reportButton: (error) => {
      reportErrorToGithubWithTemplates(error);
    },
  });
}

// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
if (require('electron-squirrel-startup')) {
  app.quit();
}
