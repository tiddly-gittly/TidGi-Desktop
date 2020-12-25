import { ipcMain, nativeTheme, protocol, session, powerMonitor, app } from 'electron';
import isDev from 'electron-is-dev';
import fs from 'fs';
// @ts-expect-error ts-migrate(2529) FIXME: Duplicate identifier 'Promise'. Compiler reserves ... Remove this comment to see the full error message
import Promise from 'bluebird';
import settings from 'electron-settings';
import { autoUpdater } from 'electron-updater';

import loadListeners from './listeners';

import * as mainWindow from './windows/main';
import * as openUrlWithWindow from './windows/open-url-with';

import createMenu from './libs/create-menu';
import extractHostname from './libs/extract-hostname';
import sendToAllWindows from './libs/send-to-all-windows';
import { stopWatchAllWiki } from './libs/wiki/watch-wiki';
import { stopAllWiki } from './libs/wiki/wiki-worker-mamager';
import { addView, reloadViewsDarkReader } from './libs/views';
import { getPreference, getPreferences } from './libs/preferences';
import { getWorkspaces, setWorkspace } from './libs/workspaces';
import { logger } from './libs/log';
import { commitAndSync } from './libs/git';
import { clearMainBindings } from './libs/i18next-electron-fs-backend';

import MAILTO_URLS from './constants/mailto-urls';

import './libs/updater';

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

app.on('second-instance', () => {
  // Someone tried to run a second instance, we should focus our window.
  const win = mainWindow.get();
  if (win !== undefined) {
    if (win.isMinimized()) win.restore();
    win.focus();
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
    const useHardwareAcceleration = getPreference('useHardwareAcceleration');
    if (!useHardwareAcceleration) {
      app.disableHardwareAcceleration();
    }

    const ignoreCertificateErrors = getPreference('ignoreCertificateErrors');
    if (ignoreCertificateErrors) {
      // https://www.electronjs.org/docs/api/command-line-switches
      app.commandLine.appendSwitch('ignore-certificate-errors');
    }
  }

  // mock app.whenReady
  let trulyReady = false;
  ipcMain.once('truly-ready', () => {
    trulyReady = true;
  });
  const whenTrulyReady = () => {
    if (trulyReady) return Promise.resolve();
    return new Promise((resolve) => {
      ipcMain.once('truly-ready', () => {
        trulyReady = true;
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
            const pathname = decodeURIComponent(request.url.replace('file:///', ''));
            callback(pathname);
          }),
      )
      .then(async () => await mainWindow.createAsync())
      .then(() => {
        const { hibernateUnusedWorkspacesAtLaunch, proxyBypassRules, proxyPacScript, proxyRules, proxyType, themeSource } = getPreferences();

        // configure proxy for default session
        if (proxyType === 'rules') {
          session.defaultSession.setProxy({
            proxyRules,
            proxyBypassRules,
          });
        } else if (proxyType === 'pacScript') {
          session.defaultSession.setProxy(({
            proxyPacScript,
            proxyBypassRules,
          } as any) as Electron.Config);
        }

        nativeTheme.themeSource = themeSource;

        createMenu();

        nativeTheme.addListener('updated', () => {
          sendToAllWindows('native-theme-updated');
          reloadViewsDarkReader();
        });

        const workspaceObjects = getWorkspaces();

        Object.keys(workspaceObjects).forEach(async (id) => {
          const workspace = workspaceObjects[id];
          if ((hibernateUnusedWorkspacesAtLaunch || workspace.hibernateWhenUnused) && !workspace.active) {
            if (!workspace.hibernated) {
              setWorkspace(workspace.id, { hibernated: true });
            }
            return;
          }
          await addView(mainWindow.get(), workspace);
          try {
            const userInfo = getPreference('github-user-info');
            const { name: wikiPath, gitUrl: githubRepoUrl, isSubWiki } = workspace;
            // wait for main wiki's watch-fs plugin to be fully initialized
            // and also wait for wiki BrowserView to be able to receive command
            // eslint-disable-next-line global-require
            const { getWorkspaceMeta } = require('./libs/workspace-metas');
            let meta = getWorkspaceMeta(id);
            if (!isSubWiki) {
              while (!meta.didFailLoad && !meta.isLoading) {
                // eslint-disable-next-line no-await-in-loop
                await Promise.delay(500);
                meta = getWorkspaceMeta(id);
              }
            }
            if (!isSubWiki && !meta.didFailLoad) {
              await commitAndSync(wikiPath, githubRepoUrl, userInfo);
            }
          } catch {
            logger.warning(`Can't sync at wikiStartup()`);
          }
        });

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
          const win = mainWindow.get();
          if (win) {
            const handleMaximize = () => {
              // getContentSize is not updated immediately
              // try once after 0.2s (for fast computer), another one after 1s (to be sure)
              setTimeout(() => {
                ipcMain.emit('request-realign-active-workspace');
              }, 200);
              setTimeout(() => {
                ipcMain.emit('request-realign-active-workspace');
              }, 1000);
            };
            win.on('maximize', handleMaximize);
            win.on('unmaximize', handleMaximize);
          }
        }
      })
      // eslint-disable-next-line promise/always-return
      .then(() => {
        // trigger whenTrulyReady
        ipcMain.emit('truly-ready');
      });
  };

  app.on('ready', () => {
    const { allowPrerelease, attachToMenubar, sidebar, titleBar, navigationBar } = getPreferences();
    // TODO: use IPC to get these config
    global.attachToMenubar = attachToMenubar;
    global.sidebar = sidebar;
    global.titleBar = titleBar;
    global.navigationBar = navigationBar;

    global.MAILTO_URLS = MAILTO_URLS;

    autoUpdater.allowPrerelease = allowPrerelease;
    autoUpdater.logger = logger;
    whenTrulyReady()
      // eslint-disable-next-line promise/always-return
      .then(() => {
        ipcMain.emit('request-check-for-updates', null, true);
      })
      .catch((error) => console.error(error));

    powerMonitor.on('shutdown', () => {
      app.quit();
    });

    commonInit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    const win = mainWindow.get();
    if (win == undefined) {
      commonInit();
    } else {
      mainWindow.show();
    }
  });

  app.on('open-url', (e, url) => {
    e.preventDefault();

    whenTrulyReady().then(() => {
      // focus on window
      mainWindow.show();

      const workspaces: any[] = Object.values(getWorkspaces());

      if (workspaces.length === 0) return null;

      // handle mailto:
      if (url.startsWith('mailto:')) {
        const mailtoWorkspaces: any[] = workspaces.filter((workspace: any) => extractHostname(workspace.homeUrl) in MAILTO_URLS);

        // pick automically if there's only one choice
        if (mailtoWorkspaces.length === 0) {
          ipcMain.emit('request-show-message-box', null, 'None of your workspaces supports composing email messages.', 'error');
          return null;
        }

        if (mailtoWorkspaces.length === 1) {
          const mailtoUrl = (MAILTO_URLS as any)[extractHostname(mailtoWorkspaces[0].homeUrl)];
          const u = mailtoUrl.replace('%s', url);
          ipcMain.emit('request-load-url', null, u, mailtoWorkspaces[0].id);
          return null;
        }

        return openUrlWithWindow.show(url);
      }

      // handle https/http
      // pick automically if there's only one choice
      if (workspaces.length === 1) {
        ipcMain.emit('request-load-url', null, url, workspaces[0].id);
        return null;
      }

      return openUrlWithWindow.show(url);
    });
  });

  app.on('before-quit', async (event) => {
    logger.info('Quitting worker threads and watcher.');
    await Promise.all([stopAllWiki(), stopWatchAllWiki()]);
    logger.info('Worker threads and watchers all terminated.');
    logger.info('Quitting I18N server.');
    clearMainBindings(ipcMain);
    logger.info('Quitted I18N server.');
    // https://github.com/atom/electron/issues/444#issuecomment-76492576
    if (process.platform === 'darwin') {
      const win = mainWindow.get();
      if (win) {
        logger.info('App force quit on MacOS');
        // FIXME: set custom property
        (win as any).forceClose = true;
      }
    }
    app.exit(0);
  });

  app.on('quit', async () => {
    logger.info('App quit');
  });
}
