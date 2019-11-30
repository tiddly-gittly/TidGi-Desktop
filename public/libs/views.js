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

    // load in same window
    if (
      // Google: Switch account
      nextDomain === 'accounts.google.com'
      // https://github.com/quanglam2807/appifier/issues/70
      || nextDomain === 'feedly.com'
      // https://github.com/quanglam2807/webcatalog/issues/315
      || (appDomain.includes('asana.com') && nextDomain.includes('asana.com'))
    ) {
      e.preventDefault();
      view.webContents.loadURL(nextUrl);
      return;
    }

    // open new window normally if domain is not defined or same domain (about:)
    if (
      nextDomain === null
      || nextDomain === appDomain
      || nextUrl.indexOf('oauth') > -1
      // https://github.com/quanglam2807/webcatalog/issues/282#issuecomment-513547183
      || (appDomain.includes('mail.google.com') && nextDomain.includes('gmail.com'))
      || (appDomain.includes('gmail.com') && nextDomain.includes('mail.google.com'))
    ) {
      // e.preventDefault();
      // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
      // options.webPreferences.affinity is not needed
      Object.assign(options, {
        parent: browserWindow,
      });
      // default behavior is similar so no need for overwriting
      // const popupWin = new BrowserWindow(options);
      // e.newGuest = popupWin;

      return;
    }

    // open external url in browser if domain doesn't match.
    e.preventDefault();
    shell.openExternal(nextUrl);
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
};

const removeView = (id) => {
  const view = views[id];
  session.fromPartition(`persist:${id}`).clearStorageData();
  view.destroy();
};

module.exports = {
  addView,
  getView,
  setActiveView,
  removeView,
};
