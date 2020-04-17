// eslint-disable-next-line import/no-extraneous-dependencies
const {
  app,
  ipcMain,
  nativeTheme,
  protocol,
  session,
} = require('electron');
const { autoUpdater } = require('electron-updater');

const loadListeners = require('./listeners');

const authWindow = require('./windows/auth');
const mainWindow = require('./windows/main');
const openUrlWithWindow = require('./windows/open-url-with');

const createMenu = require('./libs/create-menu');
const extractHostname = require('./libs/extract-hostname');
const sendToAllWindows = require('./libs/send-to-all-windows');
const { addView, reloadViewsDarkReader } = require('./libs/views');
const { getPreferences } = require('./libs/preferences');
const { getWorkspaces, setWorkspace } = require('./libs/workspaces');

const MAILTO_URLS = require('./constants/mailto-urls');

require('./libs/updater');

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
  // eslint-disable-next-line
  app.quit();
} else {
  // mock app.whenReady
  const fullyReady = false;
  const whenFullyReady = () => {
    if (fullyReady) return Promise.resolve();
    return new Promise((resolve) => {
      ipcMain.once('fully-ready', () => resolve());
    });
  };


  protocol.registerSchemesAsPrivileged([
    { scheme: 'http', privileges: { standard: true } },
    { scheme: 'https', privileges: { standard: true } },
    { scheme: 'mailto', privileges: { standard: true } },
  ]);

  loadListeners();

  const commonInit = () => {
    app.whenReady()
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

        Object.keys(workspaceObjects).forEach((id) => {
          const workspace = workspaceObjects[id];
          if (
            (hibernateUnusedWorkspacesAtLaunch || workspace.hibernateWhenUnused)
            && !workspace.active
          ) {
            if (!workspace.hibernated) {
              setWorkspace(workspace.id, { hibernated: true });
            }
            return;
          }
          addView(mainWindow.get(), workspace);
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
      .then(() => {
        // trigger whenFullyReady
        ipcMain.emit('fully-ready');
      });
  };

  app.on('ready', () => {
    const {
      allowPrerelease,
      attachToMenubar,
      sidebar,
      titleBar,
      navigationBar,
    } = getPreferences();

    global.attachToMenubar = attachToMenubar;
    global.sidebar = sidebar;
    global.titleBar = titleBar;
    global.navigationBar = navigationBar;

    global.MAILTO_URLS = MAILTO_URLS;

    autoUpdater.allowPrerelease = allowPrerelease;
    if (autoUpdater.isUpdaterActive()) {
      // https://github.com/atomery/webcatalog/issues/634
      // HACK(mc, 2019-09-10): work around https://github.com/electron-userland/electron-builder/issues/4046
      if (process.platform === 'linux' && process.env.DESKTOPINTEGRATION === 'AppImageLauncher') {
        // remap temporary running AppImage to actual source
        // THIS IS PROBABLY SUPER BRITTLE AND MAKES ME WANT TO STOP USING APPIMAGE
        autoUpdater.logger.info('AppImageLauncher detected.');
        autoUpdater.logger.info('rewriting $APPIMAGE', {
          oldValue: process.env.APPIMAGE,
          newValue: process.env.ARGV0,
        });
        process.env.APPIMAGE = process.env.ARGV0;
      }

      autoUpdater.checkForUpdates();
    }

    commonInit();
  });

  app.on('before-quit', () => {
    // https://github.com/atom/electron/issues/444#issuecomment-76492576
    if (process.platform === 'darwin') {
      const win = mainWindow.get();
      if (win) {
        win.forceClose = true;
      }
    }
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

    whenFullyReady()
      .then(() => {
        const workspaces = Object.values(getWorkspaces());

        if (workspaces.length < 1) return null;

        // handle mailto:
        if (url.startsWith('mailto:')) {
          const mailtoWorkspaces = workspaces
            .filter((workspace) => extractHostname(workspace.homeUrl) in MAILTO_URLS);

          // pick automically if there's only one choice
          if (mailtoWorkspaces.length === 0) {
            ipcMain.emit(
              'request-show-message-box', null,
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

  app.on('login', (e, webContents, request, authInfo, callback) => {
    e.preventDefault();
    const sessId = String(Date.now());
    authWindow.show(sessId, request.url);

    const listener = (ee, id, success, username, password) => {
      if (id !== sessId) return;

      if (success) {
        callback(username, password);
      } else {
        callback();
      }

      ipcMain.removeListener('continue-auth', listener);
    };

    ipcMain.on('continue-auth', listener);
  });
}
