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
const { addView } = require('./libs/views');
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
  protocol.registerSchemesAsPrivileged([
    { scheme: 'http', privileges: { standard: true } },
    { scheme: 'https', privileges: { standard: true } },
    { scheme: 'mailto', privileges: { standard: true } },
  ]);

  loadListeners();

  const commonInit = () => {
    const {
      hibernateUnusedWorkspacesAtLaunch,
      proxyBypassRules,
      proxyPacScript,
      proxyRules,
      proxyType,
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


    mainWindow.createAsync()
      .then(() => {
        createMenu();

        nativeTheme.addListener('updated', () => {
          sendToAllWindows('native-theme-updated');
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

    const workspaces = Object.values(getWorkspaces());

    if (workspaces.length < 1) return;

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
        return;
      }

      if (mailtoWorkspaces.length === 1) {
        const mailtoUrl = MAILTO_URLS[extractHostname(mailtoWorkspaces[0].homeUrl)];
        const u = mailtoUrl.replace('%s', url);
        ipcMain.emit('request-load-url', null, u, mailtoWorkspaces[0].id);
        return;
      }

      app.whenReady()
        .then(() => openUrlWithWindow.show(url));
      return;
    }

    // handle https/http
    // pick automically if there's only one choice
    if (workspaces.length === 1) {
      ipcMain.emit('request-load-url', null, url, workspaces[0].id);
      return;
    }

    app.whenReady()
      .then(() => openUrlWithWindow.show(url));
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
