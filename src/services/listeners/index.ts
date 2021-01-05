/* eslint-disable no-param-reassign */
import path from 'path';
import { BrowserView, Notification, app, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { initWikiGit, getRemoteUrl } from '../git';
import { stopWatchWiki } from '../libs/wiki/watch-wiki';
import { updateSubWikiPluginContent, getSubWikiPluginContent } from '../libs/wiki/update-plugin-content';
import { stopWiki, startWiki } from '../libs/wiki/wiki-worker-mamager';
import { logger } from '../libs/log';
import { createWiki, createSubWiki, removeWiki, ensureWikiExist, cloneWiki, cloneSubWiki } from '../libs/wiki/create-wiki';
import { ICON_PATH, REACT_PATH, DESKTOP_PATH, LOG_FOLDER, isDev as isDevelopment } from '../constants/paths';
import { getPreference, getPreferences } from '../libs/preferences';
import {
  countWorkspaces,
  getActiveWorkspace,
  getWorkspace,
  getWorkspaces,
  getWorkspaceByName,
  setWorkspacePicture,
  removeWorkspacePicture,
} from '../libs/workspaces';
import { getWorkspaceMeta, getWorkspaceMetas } from '../libs/workspace-metas';
import {
  createWorkspaceView,
  hibernateWorkspaceView,
  loadURL,
  removeWorkspaceView,
  setActiveWorkspaceView,
  setWorkspaceView,
  setWorkspaceViews,
  wakeUpWorkspaceView,
  realignActiveWorkspaceView,
} from '../workspacesView';
import i18n from '../libs/i18n';
import { reloadViewsDarkReader, reloadViewsWebContentsIfDidFailLoad, getActiveBrowserView } from '../view';
import { updatePauseNotificationsInfo, getPauseNotificationsInfo } from '../notifications';
import getViewBounds from '../libs/get-view-bounds';
import createMenu from '../libs/create-menu';

// @ts-expect-error ts-migrate(1192) FIXME: Module '"/Users/linonetwo/Desktop/repo/TiddlyGit-D... Remove this comment to see the full error message
import displayMediaWindow from '../windows/display-media';

const loadListeners = () => {
  


  ipcMain.on('request-wiki-open-tiddler', (event, tiddlerName) => {
    const browserView = getActiveBrowserView();
    if (browserView) {
      browserView.webContents.send('wiki-open-tiddler', tiddlerName);
    }
  });
  ipcMain.on('request-wiki-send-action-message', (event, actionMessage) => {
    const browserView = getActiveBrowserView();
    if (browserView) {
      browserView.webContents.send('wiki-send-action-message', actionMessage);
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
    // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
    const contents = mainWindow.get().getBrowserView().webContents;
    contents.findInPage(text, {
      forward,
    });
  });
  ipcMain.on('request-stop-find-in-page', (_, close) => {
    const win = mainWindow.get();
    // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
    const view = win.getBrowserView();
    // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
    const contents = view.webContents;
    contents.stopFindInPage('clearSelection');
    (win as any).send('update-find-in-page-matches', 0, 0);
    // adjust bounds to hide the gap for find in page
    if (close) {
      // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
      const contentSize = win.getContentSize();
      // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
      view.setBounds(getViewBounds(contentSize));
    }
  });

  // Notifications
  ipcMain.on('request-show-notification', (_, options) => {
    if ((Notification as any).isSupported()) {
      const notification = new Notification(options);
      (notification as any).show();
    }
  });
  ipcMain.on('get-pause-notifications-info', (event) => {
    event.returnValue = getPauseNotificationsInfo();
  });
  // Workspace Metas
  ipcMain.on('get-workspace-meta', (event, id) => {
    event.returnValue = getWorkspaceMeta(id);
  });
  ipcMain.on('get-workspace-metas', (event) => {
    event.returnValue = getWorkspaceMetas();
  });
  // Workspaces
  ipcMain.on('count-workspace', (event) => {
    event.returnValue = countWorkspaces();
  });
  ipcMain.on('get-workspace', (event, id) => {
    event.returnValue = getWorkspace(id);
  });
  ipcMain.on('get-workspaces', (event) => {
    event.returnValue = getWorkspaces();
  });
  ipcMain.handle('get-workspaces-remote', async (event, wikiFolderPath) => {
    return await getRemoteUrl(wikiFolderPath);
  });
  ipcMain.handle('request-create-workspace', (event, name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, picture, transparentBackground, tagName) => {
    createWorkspaceView(name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, picture, transparentBackground, tagName);
    createMenu();
  });
  ipcMain.on('request-set-active-workspace', (_, id) => {
    if (getWorkspace(id)) {
      setActiveWorkspaceView(id);
      createMenu();
    }
  });
  ipcMain.on('request-get-active-workspace', (event) => {
    event.returnValue = getActiveWorkspace();
  });
  ipcMain.on('request-realign-active-workspace', () => {
    const { sidebar, titleBar, navigationBar } = getPreferences();
    global.sidebar = sidebar;
    global.titleBar = titleBar;
    global.navigationBar = navigationBar;
    // this function only call browserView.setBounds
    // do not attempt to recall browserView.webContents.focus()
    // as it breaks page focus (cursor, scroll bar not visible)
    realignActiveWorkspaceView();
    createMenu();
  });
  ipcMain.on('request-open-url-in-workspace', (_, url, id) => {
    if (id) {
      // if id is defined, switch to that workspace
      setActiveWorkspaceView(id);
      createMenu();
      // load url in the current workspace
      const activeWorkspace = getActiveWorkspace();
      // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
      loadURL(url, activeWorkspace.id);
    }
  });
  ipcMain.on('request-wake-up-workspace', (_, id) => {
    wakeUpWorkspaceView(id);
  });
  ipcMain.on('request-hibernate-workspace', (_, id) => {
    hibernateWorkspaceView(id);
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

  ipcMain.on('request-load-url', (_, url, id) => {
    loadURL(url, id);
  });
  ipcMain.on('request-go-home', () => {
    const win = mainWindow.get();
    if (win !== undefined && win.getBrowserView() !== undefined) {
      // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
      const contents = win.getBrowserView().webContents;
      const activeWorkspace = getActiveWorkspace();
      // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
      contents.loadURL(activeWorkspace.homeUrl);
      (win as any).send('update-can-go-back', contents.canGoBack());
      (win as any).send('update-can-go-forward', contents.canGoForward());
    }
  });
  ipcMain.on('request-go-back', () => {
    const win = mainWindow.get();
    if (win !== undefined && win.getBrowserView() !== undefined) {
      // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
      const contents = win.getBrowserView().webContents;
      if (contents.canGoBack()) {
        contents.goBack();
        (win as any).send('update-can-go-back', contents.canGoBack());
        (win as any).send('update-can-go-forward', contents.canGoForward());
      }
    }
  });
  ipcMain.on('request-go-forward', () => {
    const win = mainWindow.get();
    if (win !== undefined && win.getBrowserView() !== undefined) {
      // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
      const contents = win.getBrowserView().webContents;
      if (contents.canGoForward()) {
        contents.goForward();
        (win as any).send('update-can-go-back', contents.canGoBack());
        (win as any).send('update-can-go-forward', contents.canGoForward());
      }
    }
  });
  ipcMain.on('request-reload', () => {
    const win = mainWindow.get();
    if (win !== undefined) {
      // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
      win.getBrowserView().webContents.reload();
    }
  });
  ipcMain.on('request-show-message-box', (_, message, type) => {
    dialog
      // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'BrowserWindow | undefined' is no... Remove this comment to see the full error message
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
  ipcMain.on('request-show-display-media-window', (e) => {
    const viewId = (BrowserView as any).fromWebContents(e.sender).id;
    displayMediaWindow.show(viewId);
  });
  ipcMain.on('request-quit', () => {
    app.quit();
  });
  ipcMain.on('request-check-for-updates', (e, isSilent) => {
    // https://github.com/electron-userland/electron-builder/issues/4028
    if (!autoUpdater.isUpdaterActive()) {
      return;
    }
    // https://github.com/atomery/webcatalog/issues/634
    // https://github.com/electron-userland/electron-builder/issues/4046
    // disable updater if user is using AppImageLauncher
    if (process.platform === 'linux' && process.env.DESKTOPINTEGRATION === 'AppImageLauncher') {
      dialog
        // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'BrowserWindow | undefined' is no... Remove this comment to see the full error message
        .showMessageBox(mainWindow.get(), {
          type: 'error',
          message: 'Updater is incompatible with AppImageLauncher. Please uninstall AppImageLauncher or download new updates manually from our website.',
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
          (mainWindow.get() as any).forceClose = true;
          // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
          mainWindow.get().close();
        }
        autoUpdater.quitAndInstall(false);
      });
    }
    // check for updates
    (global as any).updateSilent = Boolean(isSilent);
    autoUpdater.checkForUpdates();
  });
  // Native Theme
  ipcMain.on('get-should-use-dark-colors', (event) => {
    event.returnValue = nativeTheme.shouldUseDarkColors;
  });
  ipcMain.on('request-reload-views-dark-reader', () => {
    reloadViewsDarkReader();
  });
  // if global.forceNewWindow = true
  // the next external link request will be opened in new window
  ipcMain.on('request-set-global-force-new-window', (_, value) => {
    (global as any).forceNewWindow = value;
  });
  // https://www.electronjs.org/docs/tutorial/online-offline-events
  ipcMain.on('online-status-changed', (_, online) => {
    if (online) {
      reloadViewsWebContentsIfDidFailLoad();
    }
  });
};
export default loadListeners;
