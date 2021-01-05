import 'reflect-metadata';
import { ipcMain, nativeTheme, protocol, session, powerMonitor, app } from 'electron';
import isDev from 'electron-is-dev';
import fs from 'fs';
import { delay } from 'bluebird';
import settings from 'electron-settings';
import { autoUpdater } from 'electron-updater';

import loadListeners from '@/services/listeners';
import { container } from '@/services/container';
import * as openUrlWithWindow from '@/services/windows/open-url-with';
import createMenu from '@/services/libs/create-menu';
import extractHostname from '@/services/libs/extract-hostname';
import sendToAllWindows from '@/services/libs/send-to-all-windows';
import { stopWatchAllWiki } from '@/services/libs/wiki/watch-wiki';
import { stopAllWiki } from '@/services/libs/wiki/wiki-worker-mamager';
import { addView, reloadViewsDarkReader } from '@/services/view';
import { getWorkspaces, setWorkspace } from '@/services/libs/workspaces';
import { logger } from '@/services/libs/log';
import { commitAndSync } from '@/services/git';
import { clearMainBindings } from '@/services/libs/i18n/i18next-electron-fs-backend';
import MAILTO_URLS from '@/services/constants/mailto-urls';
import '@/services/updater';
import serviceIdentifier from '@/services/serviceIdentifier';
import { Window } from '@/services/windows';
import { WindowNames } from '@/services/windows/WindowProperties';
import { Preference } from '@/services/preferences';
const gotTheLock = app.requestSingleInstanceLock();
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      attachToMenubar: any;
      sidebar: any;
      titleBar: any;
      navigationBar: any;
      updaterObj: any;
      MAILTO_URLS: any;
    }
  }
}
container.bind<Window>(serviceIdentifier.Window).to(Window);
container.bind<Preference>(serviceIdentifier.Preference).to(Preference);
const windows = container.resolve(Window);
const preferences = container.resolve(Preference);
app.on('second-instance', () => {
  // Someone tried to run a second instance, we should focus our window.
  const mainWindow = windows.get(WindowNames.main);
  if (mainWindow !== undefined) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});
if (!gotTheLock) {
  logger.info('Quitting dut to we only allow one instance to run.');
  console.info('Quitting dut to we only allow one instance to run.');
  app.quit();
} else {
  // make sure "Settings" file exists
  // if not, ignore this chunk of code
  // as using electron-settings before app.on('ready') and "Settings" is created
  // would return error
  // https://github.com/nathanbuchar/electron-settings/issues/111
  if (fs.existsSync(settings.file())) {
    const useHardwareAcceleration = preferences.get('useHardwareAcceleration');
    if (!useHardwareAcceleration) {
      app.disableHardwareAcceleration();
    }
    const ignoreCertificateErrors = preferences.get('ignoreCertificateErrors');
    if (ignoreCertificateErrors) {
      // https://www.electronjs.org/docs/api/command-line-switches
      app.commandLine.appendSwitch('ignore-certificate-errors');
    }
  }
  let commonInitFinished = false;
  /** mock app.whenReady */
  const customCommonInitFinishedEvent = 'common-init-finished';
  ipcMain.once(customCommonInitFinishedEvent, () => {
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
      ipcMain.once(customCommonInitFinishedEvent, () => {
        commonInitFinished = true;
        resolve();
      });
    });
  };
  protocol.registerSchemesAsPrivileged([
    { scheme: 'http', privileges: { standard: true } },
    { scheme: 'https', privileges: { standard: true } },
    { scheme: 'mailto', privileges: { standard: true } },
  ]);
  loadListeners();
  const commonInit = async (): Promise<void> => {
    // eslint-disable-next-line promise/catch-or-return
    return await app
      .whenReady()
      .then(
        () =>
          isDev &&
          protocol.registerFileProtocol('file', (request, callback) => {
            // TODO: this might be useless after use electron-forge, this is for loading html file after bundle, forge handle this now
            const pathname = decodeURIComponent(request.url.replace('file:///', ''));
            callback(pathname);
          }),
      )
      .then(async () => await windows.open(WindowNames.main))
      .then(async () => {
        const { hibernateUnusedWorkspacesAtLaunch, proxyBypassRules, proxyPacScript, proxyRules, proxyType, themeSource } = preferences.getPreferences();
        // configure proxy for default session
        if (proxyType === 'rules') {
          await session.defaultSession.setProxy({
            proxyRules,
            proxyBypassRules,
          });
        } else if (proxyType === 'pacScript') {
          await session.defaultSession.setProxy({
            // FIXME: 'proxyPacScript' does not exist in type 'Config'
            // proxyPacScript,
            proxyBypassRules,
          });
        }
        nativeTheme.themeSource = themeSource;
        createMenu();
        nativeTheme.addListener('updated', () => {
          sendToAllWindows('native-theme-updated');
          reloadViewsDarkReader();
        });
        const workspaceObjects = getWorkspaces();
        Object.keys(workspaceObjects).forEach(
          async (id: string): Promise<void> => {
            const workspace = workspaceObjects[id];
            if ((hibernateUnusedWorkspacesAtLaunch || workspace.hibernateWhenUnused) && !workspace.active) {
              if (!workspace.hibernated) {
                setWorkspace(workspace.id, { hibernated: true });
              }
              return;
            }
            const mainWindow = windows.get(WindowNames.main);
            await addView(mainWindow, workspace);
            try {
              // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '"github-user-info"' is not assig... Remove this comment to see the full error message
              const userInfo = preferences.get('github-user-info');
              const { name: wikiPath, gitUrl: githubRepoUrl, isSubWiki } = workspace;
              // wait for main wiki's watch-fs plugin to be fully initialized
              // and also wait for wiki BrowserView to be able to receive command
              // eslint-disable-next-line global-require
              const { getWorkspaceMeta } = require('./libs/workspace-metas');
              let meta = getWorkspaceMeta(id);
              if (!isSubWiki) {
                while (!meta.didFailLoad && !meta.isLoading) {
                  // eslint-disable-next-line no-await-in-loop
                  await delay(500);
                  meta = getWorkspaceMeta(id);
                }
              }
              if (!isSubWiki && !meta.didFailLoad) {
                await commitAndSync(wikiPath, githubRepoUrl, userInfo);
              }
            } catch {
              logger.warning(`Can't sync at wikiStartup()`);
            }
          },
        );
        ipcMain.emit('request-update-pause-notifications-info');
      })
      .then(() => {
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
          const mainWindow = windows.get(WindowNames.main);
          if (mainWindow !== undefined) {
            const handleMaximize = (): void => {
              // getContentSize is not updated immediately
              // try once after 0.2s (for fast computer), another one after 1s (to be sure)
              setTimeout(() => {
                ipcMain.emit('request-realign-active-workspace');
              }, 200);
              setTimeout(() => {
                ipcMain.emit('request-realign-active-workspace');
              }, 1000);
            };
            mainWindow.on('maximize', handleMaximize);
            mainWindow.on('unmaximize', handleMaximize);
          }
        }
      })
      // eslint-disable-next-line promise/always-return
      .then(() => {
        // trigger whenTrulyReady
        ipcMain.emit(customCommonInitFinishedEvent);
      });
  };
  app.on('ready', () => {
    const { allowPrerelease, attachToMenubar, sidebar, titleBar, navigationBar } = preferences.getPreferences();
    // TODO: use IPC to get these config
    global.attachToMenubar = attachToMenubar;
    global.sidebar = sidebar;
    global.titleBar = titleBar;
    global.navigationBar = navigationBar;
    global.MAILTO_URLS = MAILTO_URLS;
    autoUpdater.allowPrerelease = allowPrerelease;
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
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  app.on('activate', () => {
    const mainWindow = windows.get(WindowNames.main);
    if (mainWindow === undefined) {
      void commonInit();
    } else {
      mainWindow.show();
    }
  });
  app.on(
    'open-url',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (event, url): Promise<void> => {
      event.preventDefault();
      await whenCommonInitFinished();
      // focus on window
      const mainWindow = windows.get(WindowNames.main);
      if (mainWindow === undefined) {
        await commonInit();
      } else {
        mainWindow.show();
      }
      const workspaces: any[] = Object.values(getWorkspaces());
      if (workspaces.length === 0) {
        return;
      }
      // handle mailto:
      if (url.startsWith('mailto:')) {
        const mailtoWorkspaces: any[] = workspaces.filter((workspace: any) => {
          const hostName = extractHostname(workspace.homeUrl);
          return hostName !== undefined && hostName in MAILTO_URLS;
        });
        // pick automatically if there's only one choice
        if (mailtoWorkspaces.length === 0) {
          ipcMain.emit('request-show-message-box', undefined, 'None of your workspaces supports composing email messages.', 'error');
          return;
        }
        if (mailtoWorkspaces.length === 1) {
          const hostName = extractHostname(mailtoWorkspaces[0].homeUrl);
          if (hostName !== undefined) {
            const mailtoUrl = MAILTO_URLS[hostName];
            const u = mailtoUrl.replace('%s', url);
            ipcMain.emit('request-load-url', undefined, u, mailtoWorkspaces[0].id);
          }
          return;
        }
        return openUrlWithWindow.show(url);
      }
      // handle https/http
      // pick automically if there's only one choice
      if (workspaces.length === 1) {
        ipcMain.emit('request-load-url', undefined, url, workspaces[0].id);
        return;
      }
      return openUrlWithWindow.show(url);
    },
  );
  app.on(
    'before-quit',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (): Promise<void> => {
      logger.info('Quitting worker threads and watcher.');
      await Promise.all([stopAllWiki(), stopWatchAllWiki()]);
      logger.info('Worker threads and watchers all terminated.');
      logger.info('Quitting I18N server.');
      clearMainBindings(ipcMain);
      logger.info('Quitted I18N server.');
      // https://github.com/atom/electron/issues/444#issuecomment-76492576
      if (process.platform === 'darwin') {
        const mainWindow = windows.get(WindowNames.main);
        if (mainWindow !== undefined) {
          logger.info('App force quit on MacOS');
          // FIXME: set custom property
          (mainWindow as any).forceClose = true;
        }
      }
      app.exit(0);
    },
  );
  app.on('quit', () => {
    logger.info('App quit');
  });
}
