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

  ipcMain.handle('request-open', (_event, uri, isDirectory) => {
    if (isDirectory) {
      shell.showItemInFolder(uri);
    } else {
      shell.openExternal(uri);
    }
  });
  // Find In Page




  ipcMain.handle('create-menu', () => {
    createMenu();
  });

  ipcMain.handle('request-quit', () => {
    app.quit();
  });
  ipcMain.handle('request-check-for-updates', (e, isSilent) => {
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
  ipcMain.handle('get-should-use-dark-colors', (event) => {
    return nativeTheme.shouldUseDarkColors;
  });

  // if global.forceNewWindow = true
  // the next external link request will be opened in new window
  ipcMain.handle('request-set-global-force-new-window', (_event, value) => {
    (global as any).forceNewWindow = value;
  });

};
export default loadListeners;
