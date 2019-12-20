const {
  BrowserView,
  BrowserWindow,
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
let shouldMuteAudio;
let shouldPauseNotifications;

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

  const handleNewWindow = (e, nextUrl, frameName, disposition, options) => {
    const appDomain = extractDomain(getWorkspace(workspace.id).homeUrl);
    const currentDomain = extractDomain(e.sender.getURL());
    const nextDomain = extractDomain(nextUrl);

    // load in same window
    if (
      // Google: Switch account
      nextDomain === 'accounts.google.com'
      // https://github.com/quanglam2807/webcatalog/issues/315
      || ((appDomain.includes('asana.com') || currentDomain.includes('asana.com')) && nextDomain.includes('asana.com'))
      || (disposition === 'foreground-tab' && (nextDomain === appDomain || nextDomain === currentDomain))
    ) {
      e.preventDefault();
      e.sender.loadURL(nextUrl);
      return;
    }

    // open new window
    if (nextDomain === appDomain || nextDomain === currentDomain) {
      // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
      e.preventDefault();
      const newOptions = {
        ...options,
        parent: browserWindow,
      };
      const popupWin = new BrowserWindow(newOptions);
      popupWin.webContents.on('new-window', handleNewWindow);
      e.newGuest = popupWin;
      return;
    }

    // open external url in browser
    if (
      nextDomain != null
      && (disposition === 'foreground-tab' || disposition === 'background-tab')
    ) {
      e.preventDefault();
      shell.openExternal(nextUrl);
    }
  };
  view.webContents.on('new-window', handleNewWindow);

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
  // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
  uaStr += ' Edge/12.10136';
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

  // Handle audio & notification preferences
  if (shouldMuteAudio !== undefined) {
    view.webContents.setAudioMuted(shouldMuteAudio);
  }
  view.webContents.once('did-stop-loading', () => {
    view.webContents.send('should-pause-notifications-changed', workspace.disableNotifications || shouldPauseNotifications);
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
  delete views[id];
};

const setViewsAudioPref = (_shouldMuteAudio) => {
  if (_shouldMuteAudio !== undefined) {
    shouldMuteAudio = _shouldMuteAudio;
  }
  Object.keys(views).forEach((id) => {
    const view = views[id];
    if (view != null) {
      const workspace = getWorkspace(id);
      view.webContents.setAudioMuted(workspace.disableAudio || shouldMuteAudio);
    }
  });
};

const setViewsNotificationsPref = (_shouldPauseNotifications) => {
  if (_shouldPauseNotifications !== undefined) {
    shouldPauseNotifications = _shouldPauseNotifications;
  }
  Object.keys(views).forEach((id) => {
    const view = views[id];
    if (view != null) {
      const workspace = getWorkspace(id);
      view.webContents.send(
        'should-pause-notifications-changed',
        Boolean(workspace.disableNotifications || shouldPauseNotifications),
      );
    }
  });
};

module.exports = {
  addView,
  getView,
  setActiveView,
  removeView,
  setViewsAudioPref,
  setViewsNotificationsPref,
};
