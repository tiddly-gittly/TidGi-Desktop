const {
  BrowserView,
  app,
  session,
  shell,
} = require('electron');
const path = require('path');
const fsExtra = require('fs-extra');

const { getPreferences } = require('./preferences');
const {
  getWorkspace,
  setWorkspace,
} = require('./workspaces');

const sendToAllWindows = require('./send-to-all-windows');

const views = {};
const badgeCounts = {};
const didFailLoad = {};
let activeId;

const extractDomain = (fullUrl) => {
  const matches = fullUrl.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
  const domain = matches && matches[1];
  return domain ? domain.replace('www.', '') : null;
};

const addView = (browserWindow, workspace) => {
  const {
    rememberLastPageVisited,
    shareWorkspaceBrowsingData,
    unreadCountBadge,
  } = getPreferences();

  const view = new BrowserView({
    webPreferences: {
      nativeWindowOpen: true,
      nodeIntegration: false,
      contextIsolation: true,
      partition: shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`,
      preload: path.join(__dirname, '..', 'preload', 'view.js'),
    },
  });

  view.webContents.on('did-start-loading', () => {
    if (getWorkspace(workspace.id).active) {
      didFailLoad[workspace.id] = false;
      sendToAllWindows('update-did-fail-load', false);
      sendToAllWindows('update-is-loading', true);
    }
  });

  view.webContents.on('did-stop-loading', () => {
    if (getWorkspace(workspace.id).active) {
      sendToAllWindows('update-is-loading', false);
    }

    const currentUrl = view.webContents.getURL();
    setWorkspace(workspace.id, {
      lastUrl: currentUrl,
    });
  });

  if (workspace.active) {
    const handleFocus = () => {
      // focus on webview
      // https://github.com/quanglam2807/webcatalog/issues/398
      view.webContents.focus();
      view.webContents.removeListener('did-stop-loading', handleFocus);
    };
    view.webContents.on('did-stop-loading', handleFocus);
  }

  // https://electronjs.org/docs/api/web-contents#event-did-fail-load
  view.webContents.on('did-fail-load', (e, errorCode, errorDesc, validateUrl, isMainFrame) => {
    if (isMainFrame && errorCode < 0 && errorCode !== -3) {
      if (getWorkspace(workspace.id).active) {
        if (getWorkspace(workspace.id).active) {
          sendToAllWindows('update-loading', false);

          didFailLoad[workspace.id] = true;
          sendToAllWindows('update-did-fail-load', true);
        }
      }
    }

    // edge case to handle failed auth
    if (errorCode === -300 && view.webContents.getURL().length === 0) {
      view.webContents.loadURL(getWorkspace(workspace.id).homeUrl);
    }
  });

  view.webContents.on('did-navigate', () => {
    if (getWorkspace(workspace.id).active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
    }
  });

  view.webContents.on('did-navigate-in-page', () => {
    if (getWorkspace(workspace.id).active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
    }
  });

  view.webContents.on('new-window', (e, nextUrl, frameName, disposition, options) => {
    const appDomain = extractDomain(getWorkspace(workspace.id).homeUrl);
    const nextDomain = extractDomain(nextUrl);

    // open new window normally if requested, or domain is not defined(about:)
    if (
      nextDomain === null
      || disposition === 'new-window'
    ) {
      // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
      Object.assign(options, {
        parent: browserWindow,
      });
      return;
    }

    // load in same window
    if (
      // Google: Switch account
      nextDomain === 'accounts.google.com'
      // https://github.com/quanglam2807/webcatalog/issues/315
      || nextDomain === appDomain
    ) {
      e.preventDefault();
      view.webContents.loadURL(nextUrl);
      return;
    }

    // open external url in browser
    if (disposition === 'foreground-tab') {
      e.preventDefault();
      shell.openExternal(nextUrl);
    }
  });

  // Handle downloads
  // https://electronjs.org/docs/api/download-item
  view.webContents.session.on('will-download', (event, item) => {
    const {
      askForDownloadPath,
      downloadPath,
    } = getPreferences();

    // Set the save path, making Electron not to prompt a save dialog.
    if (!askForDownloadPath) {
      const finalFilePath = path.join(downloadPath, item.getFilename());
      if (!fsExtra.existsSync(finalFilePath)) {
        item.setSavePath(finalFilePath);
      }
    }
  });

  // Handle downloads
  // https://electronjs.org/docs/api/download-item
  view.webContents.session.on('will-download', (event, item) => {
    const {
      askForDownloadPath,
      downloadPath,
    } = getPreferences();

    // Set the save path, making Electron not to prompt a save dialog.
    if (!askForDownloadPath) {
      const finalFilePath = path.join(downloadPath, item.getFilename());
      if (!fsExtra.existsSync(finalFilePath)) {
        item.setSavePath(finalFilePath);
      }
    }
  });

  // Hide Electron from UA to improve compatibility
  // https://github.com/quanglam2807/webcatalog/issues/182
  let uaStr = view.webContents.getUserAgent();
  uaStr = uaStr.replace(` ${app.getName()}/${app.getVersion()}`, '');
  uaStr = uaStr.replace(` Electron/${process.versions.electron}`, '');
  view.webContents.setUserAgent(uaStr);

  // Unread count badge
  if (unreadCountBadge) {
    view.webContents.on('page-title-updated', (e, title) => {
      const itemCountRegex = /[([{](\d*?)[}\])]/;
      const match = itemCountRegex.exec(title);

      const incStr = match ? match[1] : '';
      const inc = parseInt(incStr, 10) || 0;
      badgeCounts[workspace.id] = inc;
      sendToAllWindows('set-workspace', workspace.id, {
        badgeCount: inc,
      });

      let count = 0;
      Object.values(badgeCounts).forEach((c) => {
        count += c;
      });

      app.setBadgeCount(count);
    });
  }

  // Find In Page
  view.webContents.on('found-in-page', (e, result) => {
    sendToAllWindows('update-find-in-page-matches', result.activeMatchOrdinal, result.matches);
  });

  // Link preview
  view.webContents.on('update-target-url', (e, url) => {
    view.webContents.send('update-target-url', url);
  });

  views[workspace.id] = view;

  if (workspace.active) {
    activeId = workspace.id;
    browserWindow.setBrowserView(view);

    const contentSize = browserWindow.getContentSize();

    const offsetTitlebar = 0;
    const x = 68;
    const y = global.showNavigationBar ? 36 + offsetTitlebar : 0 + offsetTitlebar;

    view.setBounds({
      x,
      y,
      width: contentSize[0] - x,
      height: contentSize[1] - y,
    });
    view.setAutoResize({
      width: true,
      height: true,
    });
  }

  view.webContents.loadURL((rememberLastPageVisited && workspace.lastUrl)
  || workspace.homeUrl);
};

const getView = (id) => views[id];

const setActiveView = (browserWindow, id) => {
  // stop find in page when switching workspaces
  const currentView = browserWindow.getBrowserView();
  if (currentView) {
    currentView.webContents.stopFindInPage('clearSelection');
    browserWindow.send('close-find-in-page');
  }

  const oldActiveId = activeId;
  activeId = id;

  if (views[id] == null) {
    addView(browserWindow, getWorkspace(id));

    sendToAllWindows('update-is-loading', views[id].webContents.isLoading());
    sendToAllWindows('update-did-fail-load', Boolean(didFailLoad[id]));
  } else {
    const view = views[id];
    browserWindow.setBrowserView(view);

    const contentSize = browserWindow.getContentSize();

    const offsetTitlebar = 0;
    const x = 68;
    const y = global.showNavigationBar ? 36 + offsetTitlebar : 0 + offsetTitlebar;

    view.setBounds({
      x,
      y,
      width: contentSize[0] - x,
      height: contentSize[1] - y,
    });
    view.setAutoResize({
      width: true,
      height: true,
    });

    // focus on webview
    // https://github.com/quanglam2807/webcatalog/issues/398
    view.webContents.focus();

    sendToAllWindows('update-is-loading', view.webContents.isLoading());
    sendToAllWindows('update-did-fail-load', Boolean(didFailLoad[id]));
  }

  // hibernate old view
  if (oldActiveId !== activeId) {
    const oldWorkspace = getWorkspace(oldActiveId);
    if (oldWorkspace.hibernateWhenUnused && views[oldWorkspace.id] != null) {
      views[oldWorkspace.id].destroy();
      views[oldWorkspace.id] = null;
    }
  }
};

const removeView = (id) => {
  const view = views[id];
  session.fromPartition(`persist:${id}`).clearStorageData();
  if (view != null) {
    view.destroy();
  }
};

module.exports = {
  addView,
  getView,
  setActiveView,
  removeView,
};
