/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable no-param-reassign */
const { BrowserView, Notification, app, dialog, ipcMain, nativeTheme, shell } = require('electron');
const { autoUpdater } = require('electron-updater');

const { initWikiGit, getRemoteUrl } = require('../libs/git');
const { stopWatchWiki, watchWiki } = require('../libs/wiki/watch-wiki');
const { stopWiki, startWiki } = require('../libs/wiki/wiki-worker-mamager');
const { logger } = require('../libs/log');
const {
  createWiki,
  createSubWiki,
  removeWiki,
  ensureWikiExist,
  cloneWiki,
  cloneSubWiki,
} = require('../libs/wiki/create-wiki');
const { ICON_PATH, REACT_PATH, DESKTOP_PATH, LOG_FOLDER, isDev } = require('../constants/paths');

const { getPreference, getPreferences, resetPreferences, setPreference } = require('../libs/preferences');

const { getSystemPreference, getSystemPreferences, setSystemPreference } = require('../libs/system-preferences');

const {
  countWorkspaces,
  getActiveWorkspace,
  getWorkspace,
  getWorkspaces,
  getWorkspaceByName,
  setWorkspacePicture,
  removeWorkspacePicture,
} = require('../libs/workspaces');

const { getWorkspaceMeta, getWorkspaceMetas } = require('../libs/workspace-metas');

const {
  clearBrowsingData,
  createWorkspaceView,
  hibernateWorkspaceView,
  loadURL,
  removeWorkspaceView,
  setActiveWorkspaceView,
  setWorkspaceView,
  setWorkspaceViews,
  wakeUpWorkspaceView,
} = require('../libs/workspaces-views');
const i18n = require('../libs/i18n');

const { reloadViewsDarkReader, reloadViewsWebContentsIfDidFailLoad } = require('../libs/views');

const { updatePauseNotificationsInfo, getPauseNotificationsInfo } = require('../libs/notifications');

const getViewBounds = require('../libs/get-view-bounds');

const createMenu = require('../libs/create-menu');

const aboutWindow = require('../windows/about');
const addWorkspaceWindow = require('../windows/add-workspace');
const codeInjectionWindow = require('../windows/code-injection');
const customUserAgentWindow = require('../windows/custom-user-agent');
const displayMediaWindow = require('../windows/display-media');
const editWorkspaceWindow = require('../windows/edit-workspace');
const mainWindow = require('../windows/main');
const notificationsWindow = require('../windows/notifications');
const preferencesWindow = require('../windows/preferences');
const proxyWindow = require('../windows/proxy');
const spellcheckLanguagesWindow = require('../windows/spellcheck-languages');
const bindI18nListener = require('./i18n');

const loadListeners = () => {
  bindI18nListener();
  ipcMain.handle('copy-wiki-template', async (event, newFolderPath, folderName) => {
    try {
      await createWiki(newFolderPath, folderName);
      return '';
    } catch (error) {
      return String(error);
    }
  });
  ipcMain.handle('create-sub-wiki', async (event, newFolderPath, folderName, mainWikiToLink, tagName, onlyLink) => {
    try {
      await createSubWiki(newFolderPath, folderName, mainWikiToLink, tagName, onlyLink);
      return '';
    } catch (error) {
      console.info(error);
      return String(error);
    }
  });
  ipcMain.handle('clone-wiki', async (event, parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo) => {
    try {
      await cloneWiki(parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo);
      return '';
    } catch (error) {
      console.info(error);
      return String(error);
    }
  });
  ipcMain.handle(
    'clone-sub-wiki',
    async (event, parentFolderLocation, wikiFolderName, mainWikiPath, githubWikiUrl, userInfo, tagName) => {
      try {
        await cloneSubWiki(parentFolderLocation, wikiFolderName, mainWikiPath, githubWikiUrl, userInfo, tagName);
        // restart the main wiki to load content from private wiki
        const mainWorkspace = getWorkspaceByName(mainWikiPath);
        const userName = getPreference('userName') || '';
        await stopWatchWiki(mainWikiPath);
        await stopWiki(mainWikiPath);
        await watchWiki(mainWikiPath, githubWikiUrl, userInfo);
        await startWiki(mainWikiPath, mainWorkspace.port, userName);
        return '';
      } catch (error) {
        console.info(error);
        return String(error);
      }
    },
  );
  ipcMain.handle('ensure-wiki-exist', async (event, wikiPath, shouldBeMainWiki) => {
    try {
      await ensureWikiExist(wikiPath, shouldBeMainWiki);
      return '';
    } catch (error) {
      console.info(error);
      return String(error);
    }
  });
  ipcMain.on('get-constant', (event, name) => {
    event.returnValue = {
      ICON_PATH,
      REACT_PATH,
      DESKTOP_PATH,
      LOG_FOLDER,
      isDev,
    }[name];
  });
  ipcMain.handle('request-init-wiki-git', async (event, wikiFolderPath, githubRepoUrl, userInfo, isMainWiki) => {
    try {
      await initWikiGit(wikiFolderPath, githubRepoUrl, userInfo, isMainWiki);
      return '';
    } catch (error) {
      console.info(error);
      removeWiki(wikiFolderPath);
      return String(error);
    }
  });

  ipcMain.on('request-open', (_, uri, isDirectory) => {
    if (isDirectory) {
      shell.showItemInFolder(uri);
    } else {
      shell.openExternal(uri);
    }
  });

  // Find In Page
  ipcMain.on('request-find-in-page', (_, text, forward) => {
    const contents = mainWindow.get().getBrowserView().webContents;
    contents.findInPage(text, {
      forward,
    });
  });

  ipcMain.on('request-stop-find-in-page', (_, close) => {
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
  ipcMain.on('get-system-preference', (event, name) => {
    event.returnValue = getSystemPreference(name);
  });

  ipcMain.on('get-system-preferences', event => {
    const preferences = getSystemPreferences();
    event.returnValue = preferences;
  });

  ipcMain.on('request-set-system-preference', (_, name, value) => {
    setSystemPreference(name, value);
  });

  // Preferences
  ipcMain.on('get-preference', (event, name) => {
    event.returnValue = getPreference(name);
  });

  ipcMain.on('get-preferences', event => {
    event.returnValue = getPreferences();
  });

  ipcMain.on('request-set-preference', (_, name, value) => {
    setPreference(name, value);
  });

  ipcMain.on('request-show-code-injection-window', (_, type) => {
    codeInjectionWindow.show(type);
  });

  ipcMain.on('request-show-custom-user-agent-window', () => {
    customUserAgentWindow.show();
  });

  ipcMain.on('request-reset-preferences', () => {
    dialog
      .showMessageBox(preferencesWindow.get(), {
        type: 'question',
        buttons: ['Reset Now', 'Cancel'],
        message:
          "Are you sure? All preferences will be restored to their original defaults. Browsing data won't be affected. This action cannot be undone.",
        cancelId: 1,
      })
      .then(({ response }) => {
        // eslint-disable-next-line promise/always-return
        if (response === 0) {
          resetPreferences();
          ipcMain.emit('request-show-require-restart-dialog');
        }
      })
      .catch(console.log);
  });

  ipcMain.on('request-show-about-window', () => {
    aboutWindow.show();
  });

  ipcMain.on('request-show-preferences-window', (_, scrollTo) => {
    preferencesWindow.show(scrollTo);
  });

  ipcMain.on('request-show-edit-workspace-window', (_, id) => {
    editWorkspaceWindow.show(id);
  });

  ipcMain.on('request-show-add-workspace-window', () => {
    addWorkspaceWindow.show();
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
    dialog
      .showMessageBox(preferencesWindow.get() || mainWindow.get(), {
        type: 'question',
        buttons: ['Restart Now', 'Later'],
        message: 'You need to restart the app for this change to take affect.',
        cancelId: 1,
      })
      .then(({ response }) => {
        // eslint-disable-next-line promise/always-return
        if (response === 0) {
          app.relaunch();
          app.quit();
        }
      })
      .catch(console.log);
  });

  // Notifications
  ipcMain.on('request-show-notification', (_, options) => {
    if (Notification.isSupported()) {
      const notification = new Notification(options);
      notification.show();
    }
  });

  ipcMain.on('get-pause-notifications-info', event => {
    event.returnValue = getPauseNotificationsInfo();
  });

  ipcMain.on('request-update-pause-notifications-info', () => {
    updatePauseNotificationsInfo();
  });

  // Workspace Metas
  ipcMain.on('get-workspace-meta', (event, id) => {
    event.returnValue = getWorkspaceMeta(id);
  });

  ipcMain.on('get-workspace-metas', event => {
    event.returnValue = getWorkspaceMetas();
  });

  // Workspaces
  ipcMain.on('count-workspace', event => {
    event.returnValue = countWorkspaces();
  });

  ipcMain.on('get-workspace', (event, id) => {
    event.returnValue = getWorkspace(id);
  });

  ipcMain.on('get-workspaces', event => {
    event.returnValue = getWorkspaces();
  });

  ipcMain.handle('get-workspaces-remote', async (event, wikiFolderPath) => {
    return getRemoteUrl(wikiFolderPath);
  });

  ipcMain.handle(
    'request-create-workspace',
    (event, name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, picture, transparentBackground) => {
      createWorkspaceView(name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, picture, transparentBackground);
      createMenu();
    },
  );

  ipcMain.on('request-set-active-workspace', (_, id) => {
    if (getWorkspace(id)) {
      setActiveWorkspaceView(id);
      createMenu();
    }
  });

  ipcMain.on('request-realign-active-workspace', () => {
    const { sidebar, titleBar, navigationBar } = getPreferences();

    global.sidebar = sidebar;
    global.titleBar = titleBar;
    global.navigationBar = navigationBar;

    const activeWorkspace = getActiveWorkspace();
    if (activeWorkspace) {
      setActiveWorkspaceView(activeWorkspace.id);
    }
    createMenu();
  });

  ipcMain.on('request-open-url-in-workspace', (_, url, id) => {
    if (id) {
      // if id is defined, switch to that workspace
      setActiveWorkspaceView(id);
      createMenu();

      // load url in the current workspace
      const activeWorkspace = getActiveWorkspace();
      loadURL(url, activeWorkspace.id);
    }
  });

  ipcMain.on('request-wake-up-workspace', (_, id) => {
    wakeUpWorkspaceView(id);
  });

  ipcMain.on('request-hibernate-workspace', (_, id) => {
    hibernateWorkspaceView(id);
  });

  ipcMain.on('request-remove-workspace', (_, id) => {
    // eslint-disable-next-line promise/catch-or-return
    dialog
      .showMessageBox(mainWindow.get(), {
        type: 'question',
        buttons: [
          i18n.t('WorkspaceSelector.RemoveWorkspace'),
          i18n.t('WorkspaceSelector.RemoveWorkspaceAndDelete'),
          i18n.t('Cancel'),
        ],
        message: i18n.t('WorkspaceSelector.AreYouSure'),
        cancelId: 1,
      })
      .then(async ({ response }) => {
        // eslint-disable-next-line promise/always-return
        try {
          if (response === 0 || response === 1) {
            const workspace = getWorkspace(id);
            await stopWatchWiki(workspace.name).catch(error => logger.error(error.message, error));
            await stopWiki(workspace.name).catch(error => logger.error(error.message, error));
            await removeWiki(workspace.name, workspace.isSubWiki && workspace.mainWikiToLink, response === 0);
            removeWorkspaceView(id);
            createMenu();
          }
        } catch (error) {
          logger.error(error.message, error);
        }
      });
  });

  ipcMain.on('request-set-workspace', (_, id, options) => {
    setWorkspaceView(id, options);
    createMenu();
  });

  ipcMain.on('request-set-workspaces', (_, workspaces) => {
    setWorkspaceViews(workspaces);
    createMenu();
  });

  ipcMain.on('request-set-workspace-picture', (_, id, picturePath) => {
    setWorkspacePicture(id, picturePath);
  });

  ipcMain.on('request-remove-workspace-picture', (_, id) => {
    removeWorkspacePicture(id);
  });

  ipcMain.on('request-clear-browsing-data', () => {
    dialog
      .showMessageBox(preferencesWindow.get() || mainWindow.get(), {
        type: 'question',
        buttons: ['Clear Now', 'Cancel'],
        message: 'Are you sure? All browsing data will be cleared. This action cannot be undone.',
        cancelId: 1,
      })
      .then(({ response }) => {
        // eslint-disable-next-line promise/always-return
        if (response === 0) {
          clearBrowsingData();
        }
      })
      .catch(console.log);
  });

  ipcMain.on('request-load-url', (_, url, id) => {
    loadURL(url, id);
  });

  ipcMain.on('request-go-home', () => {
    const win = mainWindow.get();

    if (win !== undefined && win.getBrowserView() !== undefined) {
      const contents = win.getBrowserView().webContents;
      const activeWorkspace = getActiveWorkspace();
      contents.loadURL(activeWorkspace.homeUrl);
      win.send('update-can-go-back', contents.canGoBack());
      win.send('update-can-go-forward', contents.canGoForward());
    }
  });

  ipcMain.on('request-go-back', () => {
    const win = mainWindow.get();

    if (win !== undefined && win.getBrowserView() !== undefined) {
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

    if (win !== undefined && win.getBrowserView() !== undefined) {
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

    if (win !== undefined) {
      win.getBrowserView().webContents.reload();
    }
  });

  ipcMain.on('request-show-message-box', (_, message, type) => {
    dialog
      .showMessageBox(mainWindow.get(), {
        type: type || 'error',
        message,
        buttons: ['OK'],
        cancelId: 0,
        defaultId: 0,
      })
      .catch(console.log);
  });

  ipcMain.on('create-menu', () => {
    createMenu();
  });

  ipcMain.on('request-show-display-media-window', e => {
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
    // https://github.com/electron-userland/electron-builder/issues/4046
    // disable updater if user is using AppImageLauncher
    if (process.platform === 'linux' && process.env.DESKTOPINTEGRATION === 'AppImageLauncher') {
      dialog
        .showMessageBox(mainWindow.get(), {
          type: 'error',
          message:
            'Updater is incompatible with AppImageLauncher. Please uninstall AppImageLauncher or download new updates manually from our website.',
          buttons: ['Learn More', 'Go to Website', 'OK'],
          cancelId: 2,
          defaultId: 2,
        })
        .then(({ response }) => {
          // eslint-disable-next-line promise/always-return
          if (response === 0) {
            shell.openExternal('https://github.com/electron-userland/electron-builder/issues/4046');
          } else if (response === 1) {
            shell.openExternal('http://singleboxapp.com/');
          }
        })
        .catch(console.log);
      return;
    }

    // restart & apply updates
    if (global.updaterObj && global.updaterObj.status === 'update-downloaded') {
      setImmediate(() => {
        app.removeAllListeners('window-all-closed');
        if (mainWindow.get() !== undefined) {
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

  // Native Theme
  ipcMain.on('get-should-use-dark-colors', event => {
    event.returnValue = nativeTheme.shouldUseDarkColors;
  });

  ipcMain.on('request-reload-views-dark-reader', () => {
    reloadViewsDarkReader();
  });

  // if global.forceNewWindow = true
  // the next external link request will be opened in new window
  ipcMain.on('request-set-global-force-new-window', (_, value) => {
    global.forceNewWindow = value;
  });

  // https://www.electronjs.org/docs/tutorial/online-offline-events
  ipcMain.on('online-status-changed', (_, online) => {
    if (online) {
      reloadViewsWebContentsIfDidFailLoad();
    }
  });
};

module.exports = loadListeners;
