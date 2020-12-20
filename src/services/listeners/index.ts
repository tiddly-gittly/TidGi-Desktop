/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable no-param-reassign */
// @ts-expect-error ts-migrate(6200) FIXME: Definitions of the following identifiers conflict ... Remove this comment to see the full error message
import path from 'path';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'BrowserVie... Remove this comment to see the full error message
import { BrowserView, Notification, app, dialog, ipcMain, nativeTheme, shell } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'autoUpdate... Remove this comment to see the full error message
import { autoUpdater } from 'electron-updater';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'initWikiGi... Remove this comment to see the full error message
import { initWikiGit, getRemoteUrl } from '../libs/git';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'stopWatchW... Remove this comment to see the full error message
import { stopWatchWiki } from '../libs/wiki/watch-wiki';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'updateSubW... Remove this comment to see the full error message
import { updateSubWikiPluginContent, getSubWikiPluginContent } from '../libs/wiki/update-plugin-content';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'stopWiki'.
import { stopWiki, startWiki } from '../libs/wiki/wiki-worker-mamager';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'logger'.
import { logger } from '../libs/log';
import { createWiki, createSubWiki, removeWiki, ensureWikiExist, cloneWiki, cloneSubWiki } from '../libs/wiki/create-wiki';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'ICON_PATH'... Remove this comment to see the full error message
import { ICON_PATH, REACT_PATH, DESKTOP_PATH, LOG_FOLDER, isDev } from '../constants/paths';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPrefere... Remove this comment to see the full error message
import { getPreference, getPreferences, resetPreferences, setPreference } from '../libs/preferences';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getSystemP... Remove this comment to see the full error message
import { getSystemPreference, getSystemPreferences, setSystemPreference } from '../libs/system-preferences';
import {
  countWorkspaces,
  getActiveWorkspace,
  getWorkspace,
  getWorkspaces,
  getWorkspaceByName,
  setWorkspacePicture,
  removeWorkspacePicture,
} from '../libs/workspaces';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getWorkspa... Remove this comment to see the full error message
import { getWorkspaceMeta, getWorkspaceMetas } from '../libs/workspace-metas';
import {
  clearBrowsingData,
  createWorkspaceView,
  hibernateWorkspaceView,
  loadURL,
  removeWorkspaceView,
  setActiveWorkspaceView,
  setWorkspaceView,
  setWorkspaceViews,
  wakeUpWorkspaceView,
  realignActiveWorkspaceView,
} from '../libs/workspaces-views';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'index18n'.
import index18n from '../libs/i18n';
import { reloadViewsDarkReader, reloadViewsWebContentsIfDidFailLoad, getActiveBrowserView } from '../libs/views';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'updatePaus... Remove this comment to see the full error message
import { updatePauseNotificationsInfo, getPauseNotificationsInfo } from '../libs/notifications';
import getViewBounds from '../libs/get-view-bounds';
import createMenu from '../libs/create-menu';
import aboutWindow from '../windows/about';
import addWorkspaceWindow from '../windows/add-workspace';
import codeInjectionWindow from '../windows/code-injection';
import customUserAgentWindow from '../windows/custom-user-agent';
import displayMediaWindow from '../windows/display-media';
import editWorkspaceWindow from '../windows/edit-workspace';
import * as mainWindow from '../windows/main';
import notificationsWindow from '../windows/notifications';
import preferencesWindow from '../windows/preferences';
import proxyWindow from '../windows/proxy';
import spellcheckLanguagesWindow from '../windows/spellcheck-languages';
import bindI18nListener from './i18n';
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
  ipcMain.handle('clone-sub-wiki', async (event, parentFolderLocation, wikiFolderName, mainWikiPath, githubWikiUrl, userInfo, tagName) => {
    try {
      await cloneSubWiki(parentFolderLocation, wikiFolderName, mainWikiPath, githubWikiUrl, userInfo, tagName);
      return '';
    } catch (error) {
      console.info(error);
      return String(error);
    }
  });
  ipcMain.handle('ensure-wiki-exist', async (event, wikiPath, shouldBeMainWiki) => {
    try {
      await ensureWikiExist(wikiPath, shouldBeMainWiki);
      return '';
    } catch (error) {
      console.info(error);
      return String(error);
    }
  });
  ipcMain.handle('get-sub-wiki-plugin-content', (event, mainWikiPath) => getSubWikiPluginContent(mainWikiPath));
  ipcMain.on('get-constant', (event, name) => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    event.returnValue = {
      ICON_PATH,
      REACT_PATH,
      DESKTOP_PATH,
      LOG_FOLDER,
      isDev,
    }[name];
  });
  ipcMain.on('get-basename', (event, pathString) => {
    event.returnValue = path.basename(pathString);
  });
  ipcMain.on('get-dirname', (event, pathString) => {
    event.returnValue = path.dirname(pathString);
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
  ipcMain.on('get-system-preferences', (event) => {
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
  ipcMain.on('get-preferences', (event) => {
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
        message: "Are you sure? All preferences will be restored to their original defaults. Browsing data won't be affected. This action cannot be undone.",
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
    if ((Notification as any).isSupported()) {
      const notification = new Notification(options);
      (notification as any).show();
    }
  });
  ipcMain.on('get-pause-notifications-info', (event) => {
    event.returnValue = getPauseNotificationsInfo();
  });
  ipcMain.on('request-update-pause-notifications-info', () => {
    updatePauseNotificationsInfo();
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
    return getRemoteUrl(wikiFolderPath);
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
        buttons: [index18n.t('WorkspaceSelector.RemoveWorkspace'), index18n.t('WorkspaceSelector.RemoveWorkspaceAndDelete'), index18n.t('Cancel')],
        message: index18n.t('WorkspaceSelector.AreYouSure'),
        cancelId: 2,
      })
      .then(async ({ response }) => {
        // eslint-disable-next-line promise/always-return
        try {
          if (response === 0 || response === 1) {
            const workspace = getWorkspace(id);
            await stopWatchWiki(workspace.name).catch((error: any) => logger.error(error.message, error));
            await stopWiki(workspace.name).catch((error: any) => logger.error(error.message, error));
            await removeWiki(workspace.name, workspace.isSubWiki && workspace.mainWikiToLink, response === 0);
            removeWorkspaceView(id);
            createMenu();
            // restart the main wiki to load content from private wiki
            const mainWikiPath = workspace.mainWikiToLink;
            const mainWorkspace = getWorkspaceByName(mainWikiPath);
            const userName = getPreference('userName') || '';
            await stopWiki(mainWikiPath);
            await startWiki(mainWikiPath, mainWorkspace.port, userName);
            // remove folderName from fileSystemPaths
            if (workspace.isSubWiki) {
              updateSubWikiPluginContent(mainWikiPath, undefined, {
                tagName: workspace.tagName,
                subWikiFolderName: path.basename(workspace.name),
              });
            }
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
          mainWindow.get().forceClose = true;
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
