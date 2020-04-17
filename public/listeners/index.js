const {
  BrowserView,
  Notification,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} = require('electron');
const { autoUpdater } = require('electron-updater');

const {
  getPreference,
  getPreferences,
  resetPreferences,
  setPreference,
} = require('../libs/preferences');

const {
  getSystemPreference,
  getSystemPreferences,
  setSystemPreference,
} = require('../libs/system-preferences');

const {
  getActiveWorkspace,
  getWorkspace,
  getWorkspaces,
  setWorkspacePicture,
  removeWorkspacePicture,
} = require('../libs/workspaces');

const {
  clearBrowsingData,
  createWorkspaceView,
  hibernateWorkspaceView,
  loadURL,
  removeWorkspaceView,
  setActiveWorkspaceView,
  setWorkspaceView,
  wakeUpWorkspaceView,
} = require('../libs/workspaces-views');

const {
  reloadViewsDarkReader,
  reloadViewsWebContentsIfDidFailLoad,
} = require('../libs/views');

const {
  updatePauseNotificationsInfo,
  getPauseNotificationsInfo,
} = require('../libs/notifications');

const sendToAllWindows = require('../libs/send-to-all-windows');
const getWebsiteIconUrlAsync = require('../libs/get-website-icon-url-async');
const getViewBounds = require('../libs/get-view-bounds');

const createMenu = require('../libs/create-menu');

const aboutWindow = require('../windows/about');
const addWorkspaceWindow = require('../windows/add-workspace');
const codeInjectionWindow = require('../windows/code-injection');
const customUserAgentWindow = require('../windows/custom-user-agent');
const displayMediaWindow = require('../windows/display-media');
const editWorkspaceWindow = require('../windows/edit-workspace');
const licenseRegistrationWindow = require('../windows/license-registration');
const mainWindow = require('../windows/main');
const notificationsWindow = require('../windows/notifications');
const preferencesWindow = require('../windows/preferences');
const proxyWindow = require('../windows/proxy');
const spellcheckLanguagesWindow = require('../windows/spellcheck-languages');

const loadListeners = () => {
  ipcMain.on('request-open-in-browser', (e, url) => {
    shell.openExternal(url);
  });

  // Find In Page
  ipcMain.on('request-find-in-page', (e, text, forward) => {
    const contents = mainWindow.get().getBrowserView().webContents;
    contents.findInPage(text, {
      forward,
    });
  });

  ipcMain.on('request-stop-find-in-page', (e, close) => {
    const win = mainWindow.get();
    const view = win.getBrowserView();
    const contents = view.webContents;
    contents.stopFindInPage('clearSelection');

    win.send('update-find-in-page-matches', 0, 0);

    // adjust bounds to hide the gap for find in page
    if (close) {
      const contentSize = win.getContentSize();
      view.setBounds(getViewBounds(contentSize));
    }
  });

  // System Preferences
  ipcMain.on('get-system-preference', (e, name) => {
    const val = getSystemPreference(name);
    e.returnValue = val;
  });

  ipcMain.on('get-system-preferences', (e) => {
    const preferences = getSystemPreferences();
    e.returnValue = preferences;
  });

  ipcMain.on('request-set-system-preference', (e, name, value) => {
    setSystemPreference(name, value);
  });

  // Preferences
  ipcMain.on('get-preference', (e, name) => {
    const val = getPreference(name);
    e.returnValue = val;
  });

  ipcMain.on('get-preferences', (e) => {
    const preferences = getPreferences();
    e.returnValue = preferences;
  });

  ipcMain.on('request-set-preference', (e, name, value) => {
    setPreference(name, value);
  });

  ipcMain.on('request-show-code-injection-window', (e, type) => {
    codeInjectionWindow.show(type);
  });

  ipcMain.on('request-show-custom-user-agent-window', () => {
    customUserAgentWindow.show();
  });

  ipcMain.on('request-reset-preferences', () => {
    dialog.showMessageBox(preferencesWindow.get(), {
      type: 'question',
      buttons: ['Reset Now', 'Cancel'],
      message: 'Are you sure? All preferences will be restored to their original defaults. Browsing data won\'t be affected. This action cannot be undone.',
      cancelId: 1,
    })
      .then(({ response }) => {
        if (response === 0) {
          resetPreferences();
          ipcMain.emit('request-show-require-restart-dialog');
        }
      })
      .catch(console.log); // eslint-disable-line
  });

  ipcMain.on('request-show-about-window', () => {
    aboutWindow.show();
  });

  ipcMain.on('request-show-preferences-window', (e, scrollTo) => {
    preferencesWindow.show(scrollTo);
  });

  ipcMain.on('request-show-edit-workspace-window', (e, id) => {
    editWorkspaceWindow.show(id);
  });

  ipcMain.on('request-show-add-workspace-window', () => {
    addWorkspaceWindow.show();
  });

  ipcMain.on('request-show-license-registration-window', () => {
    licenseRegistrationWindow.show();
  });

  ipcMain.on('request-show-notifications-window', () => {
    notificationsWindow.show();
  });

  ipcMain.on('request-show-proxy-window', () => {
    proxyWindow.show();
  });

  ipcMain.on('request-show-spellcheck-languages-window', () => {
    spellcheckLanguagesWindow.show();
  });

  ipcMain.on('request-show-require-restart-dialog', () => {
    dialog.showMessageBox({
      type: 'question',
      buttons: ['Restart Now', 'Later'],
      message: 'You need to restart the app for this change to take affect.',
      cancelId: 1,
    })
      .then(({ response }) => {
        if (response === 0) {
          app.relaunch();
          app.exit(0);
        }
      })
      .catch(console.log); // eslint-disable-line
  });

  // Notifications
  ipcMain.on('request-show-notification', (e, opts) => {
    if (Notification.isSupported()) {
      const notif = new Notification(opts);
      notif.show();
    }
  });

  ipcMain.on('get-pause-notifications-info', (e) => {
    e.returnValue = getPauseNotificationsInfo();
  });

  ipcMain.on('request-update-pause-notifications-info', () => {
    updatePauseNotificationsInfo();
  });

  // Workspaces
  ipcMain.on('get-workspace', (e, id) => {
    const val = getWorkspace(id);
    e.returnValue = val;
  });

  ipcMain.on('get-workspaces', (e) => {
    const workspaces = getWorkspaces();
    e.returnValue = workspaces;
  });

  ipcMain.on('request-create-workspace', (e, name, homeUrl, picture, transparentBackground) => {
    createWorkspaceView(name, homeUrl, picture, transparentBackground);
    createMenu();
  });

  ipcMain.on('request-set-active-workspace', (e, id) => {
    setActiveWorkspaceView(id);
    createMenu();
  });

  ipcMain.on('request-realign-active-workspace', () => {
    const {
      sidebar,
      titleBar,
      navigationBar,
    } = getPreferences();

    global.sidebar = sidebar;
    global.titleBar = titleBar;
    global.navigationBar = navigationBar;

    const activeWorkspace = getActiveWorkspace();
    if (activeWorkspace) {
      setActiveWorkspaceView(activeWorkspace.id);
    }
    createMenu();
  });

  ipcMain.on('request-open-url-in-workspace', (e, url, id) => {
    if (id) {
      // if id is defined, switch to that workspace
      setActiveWorkspaceView(id);
      createMenu();

      // load url in the current workspace
      const activeWorkspace = getActiveWorkspace();
      loadURL(url, activeWorkspace.id);
    }
  });

  ipcMain.on('request-wake-up-workspace', (e, id) => {
    wakeUpWorkspaceView(id);
  });

  ipcMain.on('request-hibernate-workspace', (e, id) => {
    hibernateWorkspaceView(id);
  });

  ipcMain.on('request-remove-workspace', (e, id) => {
    dialog.showMessageBox(preferencesWindow.get() || mainWindow.get(), {
      type: 'question',
      buttons: ['Remove Workspace', 'Cancel'],
      message: 'Are you sure? All browsing data of this workspace will be wiped. This action cannot be undone.',
      cancelId: 1,
    })
      .then(({ response }) => {
        if (response === 0) {
          removeWorkspaceView(id);
          createMenu();
        }
      })
      .catch(console.log); // eslint-disable-line
  });

  ipcMain.on('request-set-workspace', (e, id, opts) => {
    setWorkspaceView(id, opts);
    createMenu();
  });

  ipcMain.on('request-set-workspace-picture', (e, id, picturePath) => {
    setWorkspacePicture(id, picturePath);
  });

  ipcMain.on('request-remove-workspace-picture', (e, id) => {
    removeWorkspacePicture(id);
  });

  ipcMain.on('request-clear-browsing-data', () => {
    dialog.showMessageBox(preferencesWindow.get() || mainWindow.get(), {
      type: 'question',
      buttons: ['Clear Now', 'Cancel'],
      message: 'Are you sure? All browsing data will be cleared. This action cannot be undone.',
      cancelId: 1,
    })
      .then(({ response }) => {
        if (response === 0) {
          clearBrowsingData();
        }
      })
      .catch(console.log); // eslint-disable-line
  });

  ipcMain.on('request-load-url', (e, url, id) => {
    loadURL(url, id);
  });

  ipcMain.on('request-go-home', () => {
    const win = mainWindow.get();

    if (win != null && win.getBrowserView() != null) {
      const contents = win.getBrowserView().webContents;
      const activeWorkspace = getActiveWorkspace();
      contents.loadURL(activeWorkspace.homeUrl);
      win.send('update-can-go-back', contents.canGoBack());
      win.send('update-can-go-forward', contents.canGoForward());
    }
  });

  ipcMain.on('request-go-back', () => {
    const win = mainWindow.get();

    if (win != null && win.getBrowserView() != null) {
      const contents = win.getBrowserView().webContents;
      if (contents.canGoBack()) {
        contents.goBack();
        win.send('update-can-go-back', contents.canGoBack());
        win.send('update-can-go-forward', contents.canGoForward());
      }
    }
  });

  ipcMain.on('request-go-forward', () => {
    const win = mainWindow.get();

    if (win != null && win.getBrowserView() != null) {
      const contents = win.getBrowserView().webContents;
      if (contents.canGoForward()) {
        contents.goForward();
        win.send('update-can-go-back', contents.canGoBack());
        win.send('update-can-go-forward', contents.canGoForward());
      }
    }
  });

  ipcMain.on('request-reload', () => {
    const win = mainWindow.get();

    if (win != null) {
      win.getBrowserView().webContents.reload();
    }
  });

  ipcMain.on('request-show-message-box', (e, message, type) => {
    dialog.showMessageBox(mainWindow.get(), {
      type: type || 'error',
      message,
      buttons: ['OK'],
      cancelId: 0,
      defaultId: 0,
    }).catch(console.log); // eslint-disable-line
  });

  ipcMain.on('create-menu', () => {
    createMenu();
  });

  ipcMain.on('request-show-display-media-window', (e) => {
    const viewId = BrowserView.fromWebContents(e.sender).id;
    displayMediaWindow.show(viewId);
  });

  ipcMain.on('request-quit', () => {
    app.quit();
  });

  ipcMain.on('request-check-for-updates', (e, isSilent) => {
    // https://github.com/electron-userland/electron-builder/issues/4028
    if (!autoUpdater.isUpdaterActive()) return;

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

    // restart & apply updates
    if (global.updaterObj && global.updaterObj.status === 'update-downloaded') {
      setImmediate(() => {
        app.removeAllListeners('window-all-closed');
        if (mainWindow.get() != null) {
          mainWindow.get().forceClose = true;
          mainWindow.get().close();
        }
        autoUpdater.quitAndInstall(false);
      });
    }

    // check for updates
    global.updateSilent = Boolean(isSilent);
    autoUpdater.checkForUpdates();
  });

  // to be replaced with invoke (electron 7+)
  // https://electronjs.org/docs/api/ipc-renderer#ipcrendererinvokechannel-args
  ipcMain.on('request-get-website-icon-url', (e, id, url) => {
    getWebsiteIconUrlAsync(url)
      .then((iconUrl) => {
        sendToAllWindows(id, iconUrl);
      })
      .catch((err) => {
        console.log(err); // eslint-disable-line no-console
        sendToAllWindows(id, null);
      });
  });

  // Native Theme
  ipcMain.on('get-should-use-dark-colors', (e) => {
    e.returnValue = nativeTheme.shouldUseDarkColors;
  });

  ipcMain.on('request-reload-views-dark-reader', () => {
    reloadViewsDarkReader();
  });

  // if global.forceNewWindow = true
  // the next external link request will be opened in new window
  ipcMain.on('request-set-global-force-new-window', (e, val) => {
    global.forceNewWindow = val;
  });

  // https://www.electronjs.org/docs/tutorial/online-offline-events
  ipcMain.on('online-status-changed', (e, online) => {
    if (online) {
      reloadViewsWebContentsIfDidFailLoad();
    }
  });
};

module.exports = loadListeners;
