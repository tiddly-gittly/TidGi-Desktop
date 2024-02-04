/* eslint-disable unicorn/prefer-top-level-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { uninstall } from './helpers/installV8Cache';
import 'source-map-support/register';
import 'reflect-metadata';
import './helpers/singleInstance';
import './services/database/configSetting';
import { app, ipcMain, powerMonitor, protocol } from 'electron';
import unhandled from 'electron-unhandled';
import fs from 'fs-extra';
import inspector from 'node:inspector';

import { MainChannel } from '@/constants/channels';
import { isTest } from '@/constants/environment';
import { container } from '@services/container';
import { initRendererI18NHandler } from '@services/libs/i18n';
import { destroyLogger, logger } from '@services/libs/log';
import { buildLanguageMenu } from '@services/menu/buildLanguageMenu';

import { bindServiceAndProxy } from '@services/libs/bindServiceAndProxy';
import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';

import { IDatabaseService } from '@services/database/interface';
import { initializeObservables } from '@services/libs/initializeObservables';
import { reportErrorToGithubWithTemplates } from '@services/native/reportError';
import type { IUpdaterService } from '@services/updater/interface';
import { IWikiService } from '@services/wiki/interface';
import { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import EventEmitter from 'events';
import { isLinux } from './helpers/system';
import type { IPreferenceService } from './services/preferences/interface';
import type { IWindowService } from './services/windows/interface';
import type { IWorkspaceViewService } from './services/workspacesView/interface';

logger.info('App booting');
if (process.env.DEBUG_MAIN === 'true') {
  inspector.open();
  inspector.waitForDebugger();
  // eslint-disable-next-line no-debugger
  debugger;
}

// fix (node:9024) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 destroyed listeners added to [WebContents]. Use emitter.setMaxListeners() to increase limit (node:9024) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 devtools-reload-page listeners added to [WebContents]. Use emitter.setMaxListeners() to increase limit
EventEmitter.defaultMaxListeners = 150;
app.commandLine.appendSwitch('--disable-web-security');
protocol.registerSchemesAsPrivileged([
  { scheme: 'http', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'https', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'tidgi', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'open', privileges: { bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'file', privileges: { bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
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
const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
app.on('second-instance', async () => {
  // see also src/helpers/singleInstance.ts
  // Someone tried to run a second instance, for example, when `runOnBackground` is true, we should focus our window.
  await windowService.open(WindowNames.main);
});
app.on('activate', async () => {
  await windowService.open(WindowNames.main);
});
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
const commonInit = async (): Promise<void> => {
  await app.whenReady();
  // if user want a menubar, we create a new window for that
  await Promise.all([
    windowService.open(WindowNames.main),
    preferenceService.get('attachToMenubar').then(async (attachToMenubar) => {
      attachToMenubar && await windowService.open(WindowNames.menuBar);
    }),
    databaseService.initializeForApp(),
  ]);
  initializeObservables();
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
  await initRendererI18NHandler();
  powerMonitor.on('shutdown', () => {
    app.quit();
  });
  await commonInit();
  try {
    buildLanguageMenu();
    if (await preferenceService.get('syncBeforeShutdown')) {
      wikiGitWorkspaceService.registerSyncBeforeShutdown();
    }
    await updaterService.checkForUpdates();
  } catch (error) {
    logger.error(`Error when app.on('ready'): ${(error as Error).message}`);
  }
});
app.on(MainChannel.windowAllClosed, async () => {
  // prevent quit on MacOS. But also quit if we are in test.
  if (isTest || !(await preferenceService.get('runOnBackground'))) {
    app.quit();
  }
});
app.on(
  'before-quit',
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (): Promise<void> => {
    logger.info('App before-quit');
    await Promise.all([
      databaseService.immediatelyStoreSettingsToFile(),
      wikiService.stopAllWiki(),
      windowService.clearWindowsReference(),
    ]);
    destroyLogger();
    app.exit(0);
  },
);
app.on('quit', () => {
  uninstall?.uninstall();
  logger.info('App quit');
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
