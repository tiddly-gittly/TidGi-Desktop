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
let shouldMuteAudio;
let shouldPauseNotifications;

const extractDomain = (fullUrl) => {
  const matches = fullUrl.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
  const domain = matches && matches[1];
  // https://stackoverflow.com/a/9928725
  return domain ? domain.replace(/^(www\.)/, '') : null;
};

// https://stackoverflow.com/a/14645182
const isSubdomain = (url) => {
  const regex = new RegExp(/^([a-z]+:\/{2})?([\w-]+\.[\w-]+\.\w+)$/);
  return !!url.match(regex); // make sure it returns boolean
};

const equivalentDomain = (domain) => {
  if (!domain) return null;

  let eDomain = domain;

  const prefixes = ['www', 'app', 'login', 'go', 'accounts', 'open'];
  // app.portcast.io ~ portcast.io
  // login.xero.com ~ xero.com
  // go.xero.com ~ xero.com
  // accounts.google.com ~ google.com
  // open.spotify.com ~ spotify.com

  // remove one by one not to break domain
  prefixes.forEach((prefix) => {
    // check if subdomain, if not return the domain
    if (isSubdomain(eDomain)) {
      // https://stackoverflow.com/a/9928725
      const regex = new RegExp(`^(${prefix}.)`);
      eDomain = eDomain.replace(regex, '');
    }
  });

  return eDomain;
};

const addView = (browserWindow, workspace) => {
  if (views[workspace.id] != null) return;

  const {
    customUserAgent,
    rememberLastPageVisited,
    shareWorkspaceBrowsingData,
    unreadCountBadge,
  } = getPreferences();

  const contentSize = browserWindow.getContentSize();

  const offsetTitlebar = process.platform !== 'darwin' || global.showSidebar || global.attachToMenubar ? 0 : 22;
  const x = global.showSidebar ? 68 : 0;
  const y = global.showNavigationBar ? 36 + offsetTitlebar : 0 + offsetTitlebar;

  const view = new BrowserView({
    webPreferences: {
      nativeWindowOpen: true,
      nodeIntegration: false,
      contextIsolation: true,
      partition: shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`,
      preload: path.join(__dirname, '..', 'preload', 'view.js'),
    },
  });

  let adjustUserAgentByUrl = () => false;
  if (customUserAgent) {
    view.webContents.setUserAgent(customUserAgent);
  } else {
    // Hide Electron from UA to improve compatibility
    // https://github.com/quanglam2807/webcatalog/issues/182
    const uaStr = view.webContents.getUserAgent();
    const commonUaStr = uaStr
      // Fix WhatsApp requires Google Chrome 49+ bug
      .replace(` ${app.getName()}/${app.getVersion()}`, '')
      // Hide Electron from UA to improve compatibility
      // https://github.com/quanglam2807/webcatalog/issues/182
      .replace(` Electron/${process.versions.electron}`, '');
    view.webContents.setUserAgent(customUserAgent || commonUaStr);

    // fix Google prevents signing in because of security concerns
    // https://github.com/quanglam2807/webcatalog/issues/455
    // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
    const fakedEdgeUaStr = `${commonUaStr} Edge/18.18875`;
    adjustUserAgentByUrl = (url) => {
      if (customUserAgent) return false;

      const navigatedDomain = extractDomain(url);
      const currentUaStr = view.webContents.getUserAgent();
      if (navigatedDomain === 'accounts.google.com') {
        if (currentUaStr !== fakedEdgeUaStr) {
          view.webContents.setUserAgent(fakedEdgeUaStr);
          return true;
        }
      } else if (currentUaStr !== commonUaStr) {
        view.webContents.setUserAgent(commonUaStr);
        return true;
      }
      return false;
    };
  }

  view.webContents.on('will-navigate', (e, url) => {
    adjustUserAgentByUrl(url);
  });

  view.webContents.on('did-start-loading', () => {
    if (getWorkspace(workspace.id).active) {
      // show browserView again when reloading after error
      // see did-fail-load event
      if (didFailLoad[workspace.id]) {
        view.setBounds({
          x,
          y,
          width: contentSize[0] - x,
          height: contentSize[1] - y,
        });
      }
      didFailLoad[workspace.id] = false;
      sendToAllWindows('update-did-fail-load', false);
      sendToAllWindows('update-is-loading', true);
    }
  });

  view.webContents.on('did-stop-loading', () => {
    if (getWorkspace(workspace.id).active) {
      sendToAllWindows('update-is-loading', false);
      sendToAllWindows('update-address', view.webContents.getURL(), false);
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
        sendToAllWindows('update-loading', false);

        didFailLoad[workspace.id] = true;
        view.setBounds({
          x,
          y,
          height: 0,
          width: 0,
        }); // hide browserView to show error message
        sendToAllWindows('update-did-fail-load', true);
      }
    }

    // edge case to handle failed auth
    if (errorCode === -300 && view.webContents.getURL().length === 0) {
      view.webContents.loadURL(getWorkspace(workspace.id).homeUrl);
    }
  });

  view.webContents.on('did-navigate', (e, url) => {
    // fix Google prevents signing in because of security concerns
    // https://github.com/quanglam2807/webcatalog/issues/455
    // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
    // will-navigate doesn't trigger for loadURL, goBack, goForward
    // so user agent to needed to be double check here
    // not the best solution as page will be unexpectedly reloaded
    // but it won't happen very often
    if (adjustUserAgentByUrl(url)) {
      view.webContents.reload();
    }

    if (getWorkspace(workspace.id).active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      sendToAllWindows('update-address', url, false);
    }
  });

  view.webContents.on('did-navigate-in-page', (e, url) => {
    if (getWorkspace(workspace.id).active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      sendToAllWindows('update-address', url, false);
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
      adjustUserAgentByUrl(nextUrl);
      e.sender.loadURL(nextUrl);
      return;
    }

    // open new window
    if (equivalentDomain(nextDomain) === equivalentDomain(appDomain)
     || equivalentDomain(nextDomain) === equivalentDomain(currentDomain)) {
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
      return;
    }

    // App tries to open external link using JS
    // nextURL === 'about:blank' but then window will redirect to the external URL
    // https://github.com/quanglam2807/webcatalog/issues/467#issuecomment-569857721
    if (
      nextDomain === null
      && (disposition === 'foreground-tab' || disposition === 'background-tab')
    ) {
      e.preventDefault();
      const newOptions = {
        ...options,
        show: false,
        parent: browserWindow,
      };
      const popupWin = new BrowserWindow(newOptions);
      popupWin.webContents.on('new-window', handleNewWindow);
      popupWin.webContents.once('will-navigate', (_, url) => {
        const retrievedDomain = extractDomain(url);
        // if the window is used for the current app, then use default behavior
        if (equivalentDomain(retrievedDomain) === equivalentDomain(appDomain)
         || equivalentDomain(retrievedDomain) === equivalentDomain(currentDomain)) {
          popupWin.show();
        } else { // if not, open in browser
          e.preventDefault();
          shell.openExternal(url);
          popupWin.close();
        }
      });
      e.newGuest = popupWin;
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

      if (process.platform === 'win32') {
        if (count > 0) {
          browserWindow.setOverlayIcon(
            path.resolve(__dirname, '..', 'overlay-icon.png'),
            `You have ${count} new messages.`,
          );
        } else {
          browserWindow.setOverlayIcon(null, '');
        }
      }
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
    browserWindow.setBrowserView(view);
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

  const initialUrl = (rememberLastPageVisited && workspace.lastUrl)
  || workspace.homeUrl;
  adjustUserAgentByUrl(initialUrl);
  view.webContents.loadURL(initialUrl);
};

const getView = (id) => views[id];

const setActiveView = (browserWindow, id) => {
  // stop find in page when switching workspaces
  const currentView = browserWindow.getBrowserView();
  if (currentView) {
    currentView.webContents.stopFindInPage('clearSelection');
    browserWindow.send('close-find-in-page');
  }

  if (views[id] == null) {
    addView(browserWindow, getWorkspace(id));

    sendToAllWindows('update-is-loading', views[id].webContents.isLoading());
    sendToAllWindows('update-did-fail-load', false);
  } else {
    const view = views[id];
    browserWindow.setBrowserView(view);

    const contentSize = browserWindow.getContentSize();

    const offsetTitlebar = process.platform !== 'darwin' || global.showSidebar || global.attachToMenubar ? 0 : 22;
    const x = global.showSidebar ? 68 : 0;
    const y = global.showNavigationBar ? 36 + offsetTitlebar : 0 + offsetTitlebar;

    if (didFailLoad[id]) {
      view.setBounds({
        x,
        y,
        height: 0,
        width: 0,
      }); // hide browserView to show error message
    } else {
      view.setBounds({
        x,
        y,
        width: contentSize[0] - x,
        height: contentSize[1] - y,
      });
    }
    view.setAutoResize({
      width: true,
      height: true,
    });

    // focus on webview
    // https://github.com/quanglam2807/webcatalog/issues/398
    view.webContents.focus();

    sendToAllWindows('update-address', view.webContents.getURL(), false);
    sendToAllWindows('update-is-loading', view.webContents.isLoading());
    sendToAllWindows('update-did-fail-load', Boolean(didFailLoad[id]));
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

const hibernateView = (id) => {
  if (views[id] != null) {
    views[id].destroy();
    views[id] = null;
  }
};

module.exports = {
  addView,
  getView,
  hibernateView,
  removeView,
  setActiveView,
  setViewsAudioPref,
  setViewsNotificationsPref,
};
