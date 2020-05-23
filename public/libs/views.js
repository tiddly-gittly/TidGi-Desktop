/* eslint-disable no-param-reassign */
const {
  BrowserView,
  BrowserWindow,
  app,
  session,
  shell,
} = require('electron');
const path = require('path');
const fsExtra = require('fs-extra');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');

const { getPreferences } = require('./preferences');
const {
  getWorkspace,
  setWorkspace,
} = require('./workspaces');
const {
  setWorkspaceMeta,
  getWorkspaceMetas,
  getWorkspaceMeta,
} = require('./workspace-metas');

const sendToAllWindows = require('./send-to-all-windows');
const getViewBounds = require('./get-view-bounds');
const customizedFetch = require('./customized-fetch');

const views = {};
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

const isInternalUrl = (url, currentInternalUrls) => {
  // google have a lot of redirections after logging in
  // so assume any requests made after 'accounts.google.com' are internals
  for (let i = 0; i < currentInternalUrls.length; i += 1) {
    if (currentInternalUrls[i] && currentInternalUrls[i].startsWith('https://accounts.google.com')) {
      return true;
    }
  }

  // external links sent in Google Meet meeting goes through this link first
  // https://meet.google.com/linkredirect?authuser=1&dest=https://something.com
  if (url.startsWith('https://meet.google.com/linkredirect')) {
    return false;
  }

  const domain = equivalentDomain(extractDomain(url));
  const matchedInternalUrl = currentInternalUrls.find((internalUrl) => {
    const internalDomain = equivalentDomain(extractDomain(internalUrl));

    // Ex: music.yandex.ru => passport.yandex.ru?retpath=....music.yandex.ru
    // https://github.com/quanglam2807/webcatalog/issues/546#issuecomment-586639519
    if (domain === 'clck.yandex.ru' || domain === 'passport.yandex.ru') {
      return url.includes(internalDomain);
    }

    // domains match
    return domain === internalDomain;
  });

  return Boolean(matchedInternalUrl);
};

const addView = (browserWindow, workspace) => {
  if (views[workspace.id] != null) return;

  const {
    blockAds,
    customUserAgent,
    proxyBypassRules,
    proxyPacScript,
    proxyRules,
    proxyType,
    rememberLastPageVisited,
    shareWorkspaceBrowsingData,
    spellcheck,
    spellcheckLanguages,
    unreadCountBadge,
  } = getPreferences();

  // configure session, proxy & ad blocker
  const partitionId = shareWorkspaceBrowsingData ? 'persist:shared' : `persist:${workspace.id}`;
  // session
  const ses = session.fromPartition(partitionId);
  // proxy
  if (proxyType === 'rules') {
    ses.setProxy({
      proxyRules,
      proxyBypassRules,
    });
  } else if (proxyType === 'pacScript') {
    ses.setProxy({
      proxyPacScript,
      proxyBypassRules,
    });
  }
  // blocker
  if (blockAds) {
    ElectronBlocker.fromPrebuiltAdsAndTracking(customizedFetch, {
      path: path.join(app.getPath('userData'), 'adblocker.bin'),
      read: fsExtra.readFile,
      write: fsExtra.writeFile,
    }).then((blocker) => {
      blocker.enableBlockingInSession(ses);
    });
  }
  // spellchecker
  if (spellcheck && process.platform !== 'darwin') {
    ses.setSpellCheckerLanguages(spellcheckLanguages);
  }

  const sharedWebPreferences = {
    spellcheck,
    nativeWindowOpen: true,
    nodeIntegration: false,
    contextIsolation: true,
    session: ses,
    preload: path.join(__dirname, '..', 'preload', 'view.js'),
  };
  const view = new BrowserView({
    webPreferences: sharedWebPreferences,
  });
  // background needs to explictly set
  // if not, by default, the background of BrowserView is transparent
  // which would break the CSS of certain websites
  // even with dark mode, all major browsers
  // always use #FFF as default page background
  // https://github.com/atomery/webcatalog/issues/723
  // https://github.com/electron/electron/issues/16212
  view.setBackgroundColor('#FFF');

  let adjustUserAgentByUrl = () => false;
  if (customUserAgent) {
    view.webContents.userAgent = customUserAgent;
  } else {
    // Hide Electron from UA to improve compatibility
    // https://github.com/quanglam2807/webcatalog/issues/182
    const uaStr = view.webContents.userAgent;
    const commonUaStr = uaStr
      // Fix WhatsApp requires Google Chrome 49+ bug
      .replace(` ${app.name}/${app.getVersion()}`, '')
      // Hide Electron from UA to improve compatibility
      // https://github.com/quanglam2807/webcatalog/issues/182
      .replace(` Electron/${process.versions.electron}`, '');
    view.webContents.userAgent = customUserAgent || commonUaStr;

    // fix Google prevents signing in because of security concerns
    // https://github.com/quanglam2807/webcatalog/issues/455
    // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
    const fakedEdgeUaStr = `${commonUaStr} Edge/18.18875`;
    adjustUserAgentByUrl = (contents, url) => {
      if (customUserAgent) return false;

      const navigatedDomain = extractDomain(url);
      const currentUaStr = contents.userAgent;
      if (navigatedDomain === 'accounts.google.com') {
        if (currentUaStr !== fakedEdgeUaStr) {
          contents.userAgent = fakedEdgeUaStr;
          return true;
        }
      } else if (currentUaStr !== commonUaStr) {
        contents.userAgent = commonUaStr;
        return true;
      }
      return false;
    };
  }

  view.webContents.on('will-navigate', (e, nextUrl) => {
    // open external links in browser
    // https://github.com/atomery/webcatalog/issues/849#issuecomment-629587264
    // this behavior is likely to break many apps (eg Microsoft Teams)
    // apply this rule only to github.com for now
    const appUrl = getWorkspace(workspace.id).homeUrl;
    const currentUrl = e.sender.getURL();
    const appDomain = extractDomain(appUrl);
    const currentDomain = extractDomain(currentUrl);
    if (
      (appDomain.includes('github.com') || currentDomain.includes('github.com'))
      && !isInternalUrl(nextUrl, [appUrl, currentUrl])
    ) {
      e.preventDefault();
      shell.openExternal(nextUrl);
      return;
    }

    adjustUserAgentByUrl(e.sender.webContents, nextUrl);
  });

  view.webContents.on('did-start-loading', () => {
    const workspaceObj = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObj) return;

    if (workspaceObj.active) {
      if (getWorkspaceMeta(workspace.id).didFailLoad) {
        // show browserView again when reloading after error
        // see did-fail-load event
        if (browserWindow && !browserWindow.isDestroyed()) { // fix https://github.com/atomery/singlebox/issues/228
          const contentSize = browserWindow.getContentSize();
          view.setBounds(getViewBounds(contentSize));
        }
      }
    }

    setWorkspaceMeta(workspace.id, {
      didFailLoad: null,
      isLoading: true,
    });
  });

  view.webContents.on('did-stop-loading', () => {
    const workspaceObj = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObj) return;

    setWorkspaceMeta(workspace.id, {
      isLoading: false,
    });

    if (workspaceObj.active) {
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
    const workspaceObj = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObj) return;

    if (isMainFrame && errorCode < 0 && errorCode !== -3) {
      setWorkspaceMeta(workspace.id, {
        didFailLoad: errorDesc,
        isLoading: false,
      });
      if (workspaceObj.active) {
        if (browserWindow && !browserWindow.isDestroyed()) { // fix https://github.com/atomery/singlebox/issues/228
          const contentSize = browserWindow.getContentSize();
          view.setBounds(
            getViewBounds(contentSize, false, 0, 0),
          ); // hide browserView to show error message
        }
      }
    }

    // edge case to handle failed auth
    if (errorCode === -300 && view.webContents.getURL().length === 0) {
      view.webContents.loadURL(workspaceObj.homeUrl);
    }
  });

  view.webContents.on('did-navigate', (e, url) => {
    const workspaceObj = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObj) return;

    // fix "Google Chat isn't supported on your current browser"
    // https://github.com/atomery/webcatalog/issues/820
    if (url && url.indexOf('error/browser-not-supported') > -1 && url.startsWith('https://chat.google.com')) {
      const ref = new URL(url).searchParams.get('ref') || '';
      view.webContents.loadURL(`https://chat.google.com${ref}`);
    }

    // fix Google prevents signing in because of security concerns
    // https://github.com/quanglam2807/webcatalog/issues/455
    // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
    // will-navigate doesn't trigger for loadURL, goBack, goForward
    // so user agent to needed to be double check here
    // not the best solution as page will be unexpectedly reloaded
    // but it won't happen very often
    if (adjustUserAgentByUrl(e.sender.webContents, url)) {
      view.webContents.reload();
    }

    if (workspaceObj.active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      sendToAllWindows('update-address', url, false);
    }
  });

  view.webContents.on('did-navigate-in-page', (e, url) => {
    const workspaceObj = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObj) return;

    if (workspaceObj.active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      sendToAllWindows('update-address', url, false);
    }
  });

  view.webContents.on('page-title-updated', (e, title) => {
    const workspaceObj = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObj) return;

    if (workspaceObj.active) {
      sendToAllWindows('update-title', title);
    }
  });

  const handleNewWindow = (e, nextUrl, frameName, disposition, options) => {
    const appUrl = getWorkspace(workspace.id).homeUrl;
    const appDomain = extractDomain(appUrl);
    const currentUrl = e.sender.getURL();
    const currentDomain = extractDomain(currentUrl);
    const nextDomain = extractDomain(nextUrl);

    const openInNewWindow = () => {
      // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
      e.preventDefault();

      // if 'new-window' is triggered with Cmd+Click
      // options is undefined
      // https://github.com/atomery/webcatalog/issues/842
      const cmdClick = Boolean(!options);
      const newOptions = cmdClick ? {
        show: true,
        width: 800,
        height: 600,
        webPreferences: sharedWebPreferences,
      } : options;
      const popupWin = new BrowserWindow(newOptions);
      // WebCatalog internal value to determine whether BrowserWindow is popup
      popupWin.isPopup = true;
      popupWin.setMenuBarVisibility(false);
      popupWin.webContents.on('new-window', handleNewWindow);

      // fix Google prevents signing in because of security concerns
      // https://github.com/atomery/webcatalog/issues/455
      // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
      // will-navigate doesn't trigger for loadURL, goBack, goForward
      // so user agent to needed to be double check here
      // not the best solution as page will be unexpectedly reloaded
      // but it won't happen very often
      popupWin.webContents.on('will-navigate', (ee, url) => {
        adjustUserAgentByUrl(ee.sender.webContents, url);
      });
      popupWin.webContents.on('did-navigate', (ee, url) => {
        if (adjustUserAgentByUrl(ee.sender.webContents, url)) {
          ee.sender.webContents.reload();
        }
      });

      // if 'new-window' is triggered with Cmd+Click
      // url is not loaded automatically
      // https://github.com/atomery/webcatalog/issues/842
      if (cmdClick) {
        popupWin.loadURL(nextUrl);
      }

      e.newGuest = popupWin;
    };

    // Conditions are listed by order of priority

    // if global.forceNewWindow = true
    // or regular new-window event
    // or if in Google Drive app, open Google Docs files internally https://github.com/atomery/webcatalog/issues/800
    // the next external link request will be opened in new window
    if (
      global.forceNewWindow
      || disposition === 'new-window'
      || disposition === 'default'
      || (appDomain === 'drive.google.com' && nextDomain === 'docs.google.com')
    ) {
      global.forceNewWindow = false;
      openInNewWindow();
      return;
    }


    // load in same window
    if (
      // Google: Add account
      nextDomain === 'accounts.google.com'
      // Google: Switch account
      || (
        nextDomain && nextDomain.indexOf('google.com') > 0
        && isInternalUrl(nextUrl, [appUrl, currentUrl])
        && (
          (nextUrl.indexOf('authuser=') > -1) // https://drive.google.com/drive/u/1/priority?authuser=2 (has authuser query)
          || (/\/u\/[0-9]+\/{0,1}$/.test(nextUrl)) // https://mail.google.com/mail/u/1/ (ends with /u/1/)
        )
      )
      // https://github.com/atomery/webcatalog/issues/315
      || ((appDomain.includes('asana.com') || currentDomain.includes('asana.com')) && nextDomain.includes('asana.com'))
    ) {
      e.preventDefault();
      adjustUserAgentByUrl(e.sender.webContents, nextUrl);
      e.sender.loadURL(nextUrl);
      return;
    }

    // open new window
    if (isInternalUrl(nextUrl, [appUrl, currentUrl])) {
      openInNewWindow();
      return;
    }

    // special case for Roam Research
    // if popup window is not opened and loaded, Roam crashes (shows white page)
    // https://github.com/atomery/webcatalog/issues/793
    if (
      appDomain === 'roamresearch.com'
      && nextDomain != null
      && (disposition === 'foreground-tab' || disposition === 'background-tab')
    ) {
      e.preventDefault();
      shell.openExternal(nextUrl);

      // mock window
      // close as soon as it did-navigate
      const newOptions = {
        ...options,
        show: false,
      };
      const popupWin = new BrowserWindow(newOptions);
      // WebCatalog internal value to determine whether BrowserWindow is popup
      popupWin.isPopup = true;
      popupWin.once('did-navigate', () => {
        popupWin.close();
      });
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
      };
      const popupWin = new BrowserWindow(newOptions);
      popupWin.setMenuBarVisibility(false);
      popupWin.webContents.on('new-window', handleNewWindow);
      popupWin.webContents.once('will-navigate', (_, url) => {
        // if the window is used for the current app, then use default behavior
        if (isInternalUrl(url, [appUrl, currentUrl])) {
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
        // eslint-disable-next-line no-param-reassign
        item.savePath = finalFilePath;
      }
    } else {
      // set preferred path for save dialog
      const opts = {
        ...item.getSaveDialogOptions(),
        defaultPath: path.join(downloadPath, item.getFilename()),
      };
      item.setSaveDialogOptions(opts);
    }
  });

  // Unread count badge
  if (unreadCountBadge) {
    view.webContents.on('page-title-updated', (e, title) => {
      const itemCountRegex = /[([{](\d*?)[}\])]/;
      const match = itemCountRegex.exec(title);

      const incStr = match ? match[1] : '';
      const inc = parseInt(incStr, 10) || 0;
      setWorkspaceMeta(workspace.id, {
        badgeCount: inc,
      });

      let count = 0;
      const metas = getWorkspaceMetas();
      Object.values(metas).forEach((m) => {
        if (m && m.badgeCount) {
          count += m.badgeCount;
        }
      });

      app.badgeCount = count;

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
    try {
      view.webContents.send('update-target-url', url);
    } catch (err) {
      console.log(err); // eslint-disable-line no-console
    }
  });

  // Handle audio & notification preferences
  if (shouldMuteAudio !== undefined) {
    view.webContents.audioMuted = shouldMuteAudio;
  }
  view.webContents.once('did-stop-loading', () => {
    view.webContents.send('should-pause-notifications-changed', workspace.disableNotifications || shouldPauseNotifications);
  });

  views[workspace.id] = view;

  if (workspace.active) {
    browserWindow.setBrowserView(view);
    const contentSize = browserWindow.getContentSize();
    view.setBounds(getViewBounds(contentSize));
    view.setAutoResize({
      width: true,
      height: true,
    });
  }

  const initialUrl = (rememberLastPageVisited && workspace.lastUrl)
  || workspace.homeUrl;
  adjustUserAgentByUrl(view.webContents, initialUrl);
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
  } else {
    const view = views[id];
    browserWindow.setBrowserView(view);

    const contentSize = browserWindow.getContentSize();

    if (getWorkspaceMeta(id).didFailLoad) {
      view.setBounds(
        getViewBounds(contentSize, false, 0, 0),
      ); // hide browserView to show error message
    } else {
      view.setBounds(getViewBounds(contentSize));
    }
    view.setAutoResize({
      width: true,
      height: true,
    });

    // focus on webview
    // https://github.com/quanglam2807/webcatalog/issues/398
    view.webContents.focus();

    sendToAllWindows('update-address', view.webContents.getURL(), false);
    sendToAllWindows('update-title', view.webContents.getTitle());
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
      view.webContents.audioMuted = workspace.disableAudio || shouldMuteAudio;
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

const reloadViewsDarkReader = () => {
  Object.keys(views).forEach((id) => {
    const view = views[id];
    if (view != null) {
      view.webContents.send('reload-dark-reader');
    }
  });
};

const reloadViewsWebContentsIfDidFailLoad = () => {
  const metas = getWorkspaceMetas();
  Object.keys(metas).forEach((id) => {
    if (!metas[id].didFailLoad) return;

    const view = views[id];
    if (view != null) {
      view.webContents.reload();
    }
  });
};

module.exports = {
  addView,
  getView,
  hibernateView,
  reloadViewsDarkReader,
  reloadViewsWebContentsIfDidFailLoad,
  removeView,
  setActiveView,
  setViewsAudioPref,
  setViewsNotificationsPref,
};
