// eslint-disable-next-line import/no-extraneous-dependencies
const { ipcMain, nativeTheme, protocol, session, powerMonitor, remote } = require('electron');
const isDev = require('electron-is-dev');
const fs = require('fs');
const settings = require('electron-settings');
const { autoUpdater } = require('electron-updater');

const loadListeners = require('./listeners');

const mainWindow = require('./windows/main');
const openUrlWithWindow = require('./windows/open-url-with');

const createMenu = require('./libs/create-menu');
const extractHostname = require('./libs/extract-hostname');
const sendToAllWindows = require('./libs/send-to-all-windows');
const { stopWatchAllWiki } = require('./libs/wiki/watch-wiki');
const { stopAllWiki } = require('./libs/wiki/wiki-worker-mamager');
const { addView, reloadViewsDarkReader } = require('./libs/views');
const { getPreference, getPreferences } = require('./libs/preferences');
const { getWorkspaces, setWorkspace } = require('./libs/workspaces');
const { logger } = require('./libs/log');
const { commitAndSync } = require('./libs/git');
const { clearMainBindings } = require('./libs/i18next-electron-fs-backend');

const MAILTO_URLS = require('./constants/mailto-urls');

require('./libs/updater');

// eslint-disable-next-line import/order, global-require
const app = require('electron').app || remote.app;
// see https://github.com/electron/electron/issues/18397
app.allowRendererProcessReuse = true;

const gotTheLock = app.requestSingleInstanceLock();

app.on('second-instance', () => {
  // Someone tried to run a second instance, we should focus our window.
  const win = mainWindow.get();
  if (win != null) {
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
    return new Promise(resolve => {
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

  const commonInit = () => {
    // eslint-disable-next-line promise/catch-or-return
    app
      .whenReady()
      .then(
        () =>
          isDev &&
          protocol.registerFileProtocol('file', (request, callback) => {
            const pathname = decodeURIComponent(request.url.replace('file:///', ''));
            callback(pathname);
          }),
      )
      .then(() => mainWindow.createAsync())
      .then(() => {
        const {
          hibernateUnusedWorkspacesAtLaunch,
          proxyBypassRules,
          proxyPacScript,
          proxyRules,
          proxyType,
          themeSource,
        } = getPreferences();

        // configure proxy for default session
        if (proxyType === 'rules') {
          session.defaultSession.setProxy({
            proxyRules,
            proxyBypassRules,
          });
        } else if (proxyType === 'pacScript') {
          session.defaultSession.setProxy({
            proxyPacScript,
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

        Object.keys(workspaceObjects).forEach(async id => {
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
            const { name: wikiPath, gitUrl: githubRepoUrl } = workspace;
            // wait for wiki's watch-fs plugin to be fully initialized
            await commitAndSync(wikiPath, githubRepoUrl, userInfo);
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
      })
      // eslint-disable-next-line promise/always-return
      .then(() => {
        // trigger whenTrulyReady
        ipcMain.emit('truly-ready');
      });
  };

  app.on('ready', () => {
    const { allowPrerelease, attachToMenubar, sidebar, titleBar, navigationBar } = getPreferences();
    const win = mainWindow.get();

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
      .catch(error => console.error(error));

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
    if (win == null) {
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

      const workspaces = Object.values(getWorkspaces());

      if (workspaces.length < 1) return null;

      // handle mailto:
      if (url.startsWith('mailto:')) {
        const mailtoWorkspaces = workspaces.filter(workspace => extractHostname(workspace.homeUrl) in MAILTO_URLS);

        // pick automically if there's only one choice
        if (mailtoWorkspaces.length === 0) {
          ipcMain.emit(
            'request-show-message-box',
            null,
            'None of your workspaces supports composing email messages.',
            'error',
          );
          return null;
        }

        if (mailtoWorkspaces.length === 1) {
          const mailtoUrl = MAILTO_URLS[extractHostname(mailtoWorkspaces[0].homeUrl)];
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

  app.on('before-quit', async event => {
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
        win.forceClose = true;
      }
    }
    app.exit(0);
  });

  app.on('quit', async () => {
    logger.info('App quit');
  });
}
