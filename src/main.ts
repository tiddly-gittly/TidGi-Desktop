import { uninstall } from './helpers/installV8Cache';
import 'source-map-support/register';
import 'reflect-metadata';
import './helpers/singleInstance';
import './services/database/configSetting';
import { app, ipcMain, powerMonitor, protocol } from 'electron';
import unhandled from 'electron-unhandled';
import inspector from 'node:inspector';

import { MainChannel } from '@/constants/channels';
import { isDevelopmentOrTest, isTest } from '@/constants/environment';
import { TIDGI_PROTOCOL_SCHEME } from '@/constants/protocol';
import { container } from '@services/container';
import { initRendererI18NHandler } from '@services/libs/i18n';
import { destroyLogger, logger } from '@services/libs/log';
import { buildLanguageMenu } from '@services/menu/buildLanguageMenu';

import { bindServiceAndProxy } from '@services/libs/bindServiceAndProxy';
import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IContextService } from '@services/context/interface';
import type { IDatabaseService } from '@services/database/interface';
import type { IDeepLinkService } from '@services/deepLink/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IGitService } from '@services/git/interface';
import { initializeObservables } from '@services/libs/initializeObservables';
import type { INativeService } from '@services/native/interface';
import { reportErrorToGithubWithTemplates } from '@services/native/reportError';
import type { IThemeService } from '@services/theme/interface';
import type { IUpdaterService } from '@services/updater/interface';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiEmbeddingService } from '@services/wikiEmbedding/interface';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import EventEmitter from 'events';
import { initDevelopmentExtension } from './debug';
import { isLinux } from './helpers/system';
import type { IPreferenceService } from './services/preferences/interface';
import type { IWindowService } from './services/windows/interface';
import type { IWorkspaceService } from './services/workspaces/interface';
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
app.commandLine.appendSwitch('--unsafely-disable-devtools-self-xss-warnings');
// Use different protocol scheme for test mode to avoid conflicts
protocol.registerSchemesAsPrivileged([
  { scheme: 'http', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'https', privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: TIDGI_PROTOCOL_SCHEME, privileges: { standard: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'open', privileges: { bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'file', privileges: { bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'mailto', privileges: { standard: true } },
]);
bindServiceAndProxy();

// Get services - DO NOT use them until commonInit() is called
const contextService = container.get<IContextService>(serviceIdentifier.Context);
const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
const updaterService = container.get<IUpdaterService>(serviceIdentifier.Updater);
const wikiGitWorkspaceService = container.get<IWikiGitWorkspaceService>(serviceIdentifier.WikiGitWorkspace);
const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
const wikiEmbeddingService = container.get<IWikiEmbeddingService>(serviceIdentifier.WikiEmbedding);
const windowService = container.get<IWindowService>(serviceIdentifier.Window);
const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
const deepLinkService = container.get<IDeepLinkService>(serviceIdentifier.DeepLink);
const agentDefinitionService = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
const gitService = container.get<IGitService>(serviceIdentifier.Git);
const themeService = container.get<IThemeService>(serviceIdentifier.ThemeService);
const viewService = container.get<IViewService>(serviceIdentifier.View);
const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);

app.on('second-instance', async () => {
  // see also src/helpers/singleInstance.ts
  // Someone tried to run a second instance, for example, when `runOnBackground` is true, we should focus our window.
  await windowService.open(WindowNames.main);
});
app.on('activate', async () => {
  await windowService.open(WindowNames.main);
});

const commonInit = async (): Promise<void> => {
  await app.whenReady();
  await initDevelopmentExtension();

  // Initialize context service - loads language maps after app is ready. This ensures LOCALIZATION_FOLDER path is correct (process.resourcesPath is stable)
  await contextService.initialize();
  // Initialize i18n early so error messages can be translated
  await initRendererI18NHandler();
  // Initialize database - all other services depend on it
  await databaseService.initializeForApp();

  // Apply preferences that need to be set early
  const useHardwareAcceleration = await preferenceService.get('useHardwareAcceleration');
  if (!useHardwareAcceleration) {
    app.disableHardwareAcceleration();
  }

  const ignoreCertificateErrors = await preferenceService.get('ignoreCertificateErrors');
  if (ignoreCertificateErrors) {
    // https://www.electronjs.org/docs/api/command-line-switches
    app.commandLine.appendSwitch('ignore-certificate-errors');
  }

  // Initialize agent-related services after database is ready
  await Promise.all([
    agentDefinitionService.initialize(),
    wikiEmbeddingService.initialize(),
    externalAPIService.initialize(),
  ]);

  // if user want a tidgi mini window, we create a new window for that
  // handle workspace name + tiddler name in uri https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app
  // Use different protocol for test mode to avoid conflicts with production
  deepLinkService.initializeDeepLink(TIDGI_PROTOCOL_SCHEME);

  await windowService.open(WindowNames.main);

  // Initialize services that depend on windows being created
  await Promise.all([
    gitService.initialize(),
    themeService.initialize(),
    viewService.initialize(),
    nativeService.initialize(),
  ]);

  initializeObservables();
  // Auto-create default wiki workspace if none exists. Create wiki workspace first, so it is on first one
  await wikiGitWorkspaceService.initialize();
  // Create default page workspaces before initializing all workspace views
  await workspaceService.initializeDefaultPageWorkspaces();
  // perform wiki startup and git sync for each workspace
  await workspaceViewService.initializeAllWorkspaceView();

  // Process any pending deep link after workspaces are initialized
  await deepLinkService.processPendingDeepLink();

  const tidgiMiniWindow = await preferenceService.get('tidgiMiniWindow');
  if (tidgiMiniWindow) {
    await windowService.openTidgiMiniWindow(true, false);
  }

  ipcMain.emit('request-update-pause-notifications-info');
  // Fix webview is not resized automatically
  // when window is maximized on Linux
  // https://github.com/atomery/webcatalog/issues/561
  // run it here not in mainWindow.createAsync()
  // because if the `mainWindow` is maximized or minimized
  // before the workspaces's WebContentsView fully loaded
  // error will occur
  // see https://github.com/atomery/webcatalog/issues/637
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
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  // Prevent having error
  event.preventDefault();
  // and continue
  callback(true);
});
app.on('ready', async () => {
  powerMonitor.on('shutdown', () => {
    app.quit();
  });
  await commonInit();
  try {
    // buildLanguageMenu needs menuService which is initialized in commonInit
    await buildLanguageMenu();
    if (await preferenceService.get('syncBeforeShutdown')) {
      wikiGitWorkspaceService.registerSyncBeforeShutdown();
    }
    await updaterService.checkForUpdates();
  } catch (error) {
    logger.error('Error during app ready handler', { function: "app.on('ready')", error });
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
  async (): Promise<void> => {
    logger.info('App before-quit');
    destroyLogger();
    await Promise.all([
      databaseService.immediatelyStoreSettingsToFile(),
      wikiService.stopAllWiki(),
      windowService.clearWindowsReference(),
    ]);
    uninstall?.uninstall();
  },
);

unhandled({
  showDialog: !isDevelopmentOrTest,
  logger: (error: Error) => {
    logger.error('unhandled', { error });
  },
  reportButton: (error) => {
    reportErrorToGithubWithTemplates(error);
  },
});

// Handle Windows Squirrel events (install/update/uninstall)
// Using inline implementation to avoid ESM/CommonJS compatibility issues
import squirrelStartup from './helpers/squirrelStartup';
if (squirrelStartup) {
  app.quit();
}
