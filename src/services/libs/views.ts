/* eslint-disable no-param-reassign */
import { BrowserView, BrowserWindow, app, session, shell, dialog, ipcMain } from 'electron';
import path from 'path';
import fsExtra from 'fs-extra';
import index18n from './i18n';
import wikiStartup from './wiki/wiki-startup';
import { getPreferences, getPreference } from './preferences';
import { getWorkspace, setWorkspace, getActiveWorkspace } from './workspaces';
import { setWorkspaceMeta, getWorkspaceMetas, getWorkspaceMeta } from './workspace-metas';
import sendToAllWindows from './send-to-all-windows';
import getViewBounds from './get-view-bounds';

declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const views = {};
let shouldMuteAudio: any;
let shouldPauseNotifications: any;
const extractDomain = (fullUrl: any) => {
  const matches = fullUrl.match(/^https?:\/\/([^#/?]+)(?:[#/?]|$)/i);
  const domain = matches && matches[1];
  // https://stackoverflow.com/a/9928725
  return domain ? domain.replace(/^(www\.)/, '') : null;
};
// https://stackoverflow.com/a/14645182
const isSubdomain = (url: any) => {
  const regex = new RegExp(/^([a-z]+:\/{2})?((?:[\w-]+\.){2}\w+)$/);
  return !!url.match(regex); // make sure it returns boolean
};
const equivalentDomain = (domain: any) => {
  if (!domain) {
    return null;
  }
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
const isInternalUrl = (url: any, currentInternalUrls: any) => {
  // google have a lot of redirections after logging in
  // so assume any requests made after 'accounts.google.com' are internals
  for (const currentInternalUrl of currentInternalUrls) {
    if (currentInternalUrl && currentInternalUrl.startsWith('https://accounts.google.com')) {
      return true;
    }
  }
  // external links sent in Google Meet meeting goes through this link first
  // https://meet.google.com/linkredirect?authuser=1&dest=https://something.com
  if (url.startsWith('https://meet.google.com/linkredirect')) {
    return false;
  }
  const domain = equivalentDomain(extractDomain(url));
  const matchedInternalUrl = currentInternalUrls.find((internalUrl: any) => {
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
export const addView = async (browserWindow: any, workspace: any) => {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (views[workspace.id]) {
    return;
  }
  if (workspace.isSubWiki) {
    return;
  }
  const {
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
  const userInfo = getPreference('github-user-info');
  if (!userInfo) {
    // user not logined into Github
    dialog.showMessageBox(browserWindow, {
      title: index18n.t('Dialog.GithubUserInfoNoFound'),
      message: index18n.t('Dialog.GithubUserInfoNoFoundDetail'),
      buttons: ['OK'],
      cancelId: 0,
      defaultId: 0,
    });
  }
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
      // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ proxyPacScript: any; proxyBypa... Remove this comment to see the full error message
      proxyPacScript,
      proxyBypassRules,
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
    enableRemoteModule: true,
    session: ses,
    preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
  };
  const view = new BrowserView({
    webPreferences: sharedWebPreferences,
  });
  (view.webContents as any).workspaceId = workspace.id;
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
    const uaString = view.webContents.userAgent;
    const commonUaString = uaString
      // Fix WhatsApp requires Google Chrome 49+ bug
      .replace(` ${app.name}/${app.getVersion()}`, '')
      // Hide Electron from UA to improve compatibility
      // https://github.com/quanglam2807/webcatalog/issues/182
      .replace(` Electron/${process.versions.electron}`, '');
    view.webContents.userAgent = customUserAgent || commonUaString;
    // fix Google prevents signing in because of security concerns
    // https://github.com/quanglam2807/webcatalog/issues/455
    // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
    const fakedEdgeUaString = `${commonUaString} Edge/18.18875`;
    // @ts-expect-error ts-migrate(2322) FIXME: Type '(contents: any, url: any) => boolean' is not... Remove this comment to see the full error message
    adjustUserAgentByUrl = (contents: any, url: any) => {
      if (customUserAgent) {
        return false;
      }
      const navigatedDomain = extractDomain(url);
      const currentUaString = contents.userAgent;
      if (navigatedDomain === 'accounts.google.com') {
        if (currentUaString !== fakedEdgeUaString) {
          contents.userAgent = fakedEdgeUaString;
          return true;
        }
      } else if (currentUaString !== commonUaString) {
        contents.userAgent = commonUaString;
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
    const currentUrl = (e as any).sender.getURL();
    const appDomain = extractDomain(appUrl);
    const currentDomain = extractDomain(currentUrl);
    if ((appDomain.includes('github.com') || currentDomain.includes('github.com')) && !isInternalUrl(nextUrl, [appUrl, currentUrl])) {
      e.preventDefault();
      shell.openExternal(nextUrl);
      return;
    }
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 2.
    adjustUserAgentByUrl((e as any).sender.webContents, nextUrl);
  });
  view.webContents.on('did-start-loading', () => {
    const workspaceObject = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObject) {
      return;
    }
    if (workspaceObject.active) {
      if (getWorkspaceMeta(workspace.id).didFailLoad) {
        // show browserView again when reloading after error
        // see did-fail-load event
        if (browserWindow && !browserWindow.isDestroyed()) {
          // fix https://github.com/atomery/singlebox/issues/228
          const contentSize = browserWindow.getContentSize();
          // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 1.
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
    const workspaceObject = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObject) {
      return;
    }
    // isLoading is now controlled by wiki-worker-manager.js
    // setWorkspaceMeta(workspace.id, {
    //   isLoading: false,
    // });
    if (workspaceObject.active) {
      sendToAllWindows('update-address', view.webContents.getURL(), false);
    }
    const currentUrl = view.webContents.getURL();
    setWorkspace(workspace.id, {
      lastUrl: currentUrl,
    });
    // fix https://github.com/atomery/webcatalog/issues/870
    ipcMain.emit('request-realign-active-workspace');
  });
  // focus on initial load
  // https://github.com/atomery/webcatalog/issues/398
  if (workspace.active) {
    view.webContents.once('did-stop-loading', () => {
      if (browserWindow.isFocused() && !view.webContents.isFocused()) {
        view.webContents.focus();
      }
    });
  }
  // https://electronjs.org/docs/api/web-contents#event-did-fail-load
  view.webContents.on('did-fail-load', (e, errorCode, errorDesc, validateUrl, isMainFrame) => {
    const workspaceObject = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObject) {
      return;
    }
    if (isMainFrame && errorCode < 0 && errorCode !== -3) {
      setWorkspaceMeta(workspace.id, {
        didFailLoad: errorDesc,
      });
      if (workspaceObject.active) {
        if (browserWindow && !browserWindow.isDestroyed()) {
          // fix https://github.com/atomery/singlebox/issues/228
          const contentSize = browserWindow.getContentSize();
          view.setBounds(getViewBounds(contentSize, false, 0, 0)); // hide browserView to show error message
        }
      }
    }
    // edge case to handle failed auth
    if (errorCode === -300 && view.webContents.getURL().length === 0) {
      view.webContents.loadURL(workspaceObject.homeUrl);
    }
  });
  view.webContents.on('did-navigate', (e, url) => {
    const workspaceObject = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObject) {
      return;
    }
    // fix "Google Chat isn't supported on your current browser"
    // https://github.com/atomery/webcatalog/issues/820
    if (url && url.includes('error/browser-not-supported') && url.startsWith('https://chat.google.com')) {
      const reference = new URL(url).searchParams.get('ref') || '';
      view.webContents.loadURL(`https://chat.google.com${reference}`);
    }
    if (workspaceObject.active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      sendToAllWindows('update-address', url, false);
    }
  });
  view.webContents.on('did-navigate-in-page', (e, url) => {
    const workspaceObject = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObject) {
      return;
    }
    if (workspaceObject.active) {
      sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      sendToAllWindows('update-address', url, false);
    }
  });
  view.webContents.on('page-title-updated', (e, title) => {
    const workspaceObject = getWorkspace(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (!workspaceObject) {
      return;
    }
    if (workspaceObject.active) {
      sendToAllWindows('update-title', title);
      browserWindow.setTitle(title);
    }
  });
  const handleNewWindow = (e: any, nextUrl: any, frameName: any, disposition: any, options: any) => {
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
      const newOptions = cmdClick
        ? {
            show: true,
            width: 1200,
            height: 800,
            webPreferences: sharedWebPreferences,
          }
        : { ...options, width: 1200, height: 800 };
      const popupWin = new BrowserWindow(newOptions);
      // WebCatalog internal value to determine whether BrowserWindow is popup
      (popupWin as any).isPopup = true;
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
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 2.
        adjustUserAgentByUrl((ee as any).sender.webContents, url);
      });
      popupWin.webContents.on('did-navigate', (ee, url) => {
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 2.
        if (adjustUserAgentByUrl((ee as any).sender.webContents, url)) {
          (ee as any).sender.webContents.reload();
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
      (global as any).forceNewWindow ||
      disposition === 'new-window' ||
      disposition === 'default' ||
      (appDomain === 'drive.google.com' && nextDomain === 'docs.google.com')
    ) {
      (global as any).forceNewWindow = false;
      openInNewWindow();
      return;
    }
    // load in same window
    if (
      // Google: Add account
      nextDomain === 'accounts.google.com' ||
      // Google: Switch account
      (nextDomain &&
        nextDomain.indexOf('google.com') > 0 &&
        isInternalUrl(nextUrl, [appUrl, currentUrl]) &&
        (nextUrl.includes('authuser=') || // https://drive.google.com/drive/u/1/priority?authuser=2 (has authuser query)
          /\/u\/\d+\/{0,1}$/.test(nextUrl))) || // https://mail.google.com/mail/u/1/ (ends with /u/1/)
      // https://github.com/atomery/webcatalog/issues/315
      ((appDomain.includes('asana.com') || currentDomain.includes('asana.com')) && nextDomain.includes('asana.com'))
    ) {
      e.preventDefault();
      // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 2.
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
    if (appDomain === 'roamresearch.com' && nextDomain != undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
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
      (popupWin as any).isPopup = true;
      // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
      popupWin.once('did-navigate', () => {
        popupWin.close();
      });
      e.newGuest = popupWin;
      return;
    }
    // open external url in browser
    if (nextDomain != undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
      e.preventDefault();
      shell.openExternal(nextUrl);
      return;
    }
    // App tries to open external link using JS
    // nextURL === 'about:blank' but then window will redirect to the external URL
    // https://github.com/quanglam2807/webcatalog/issues/467#issuecomment-569857721
    if (nextDomain === null && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
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
        } else {
          // if not, open in browser
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
    const { askForDownloadPath, downloadPath } = getPreferences();
    // Set the save path, making Electron not to prompt a save dialog.
    if (!askForDownloadPath) {
      const finalFilePath = path.join(downloadPath, item.getFilename());
      if (!fsExtra.existsSync(finalFilePath)) {
        // eslint-disable-next-line no-param-reassign
        item.savePath = finalFilePath;
      }
    } else {
      // set preferred path for save dialog
      const options = {
        ...item.getSaveDialogOptions(),
        defaultPath: path.join(downloadPath, item.getFilename()),
      };
      item.setSaveDialogOptions(options);
    }
  });
  // Unread count badge
  if (unreadCountBadge) {
    view.webContents.on('page-title-updated', (e, title) => {
      const itemCountRegex = /[([{](\d*?)[)\]}]/;
      const match = itemCountRegex.exec(title);
      const incString = match ? match[1] : '';
      const inc = Number.parseInt(incString, 10) || 0;
      setWorkspaceMeta(workspace.id, {
        badgeCount: inc,
      });
      let count = 0;
      const metas = getWorkspaceMetas();
      Object.values(metas).forEach((m) => {
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        if (m && m.badgeCount) {
          // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
          count += m.badgeCount;
        }
      });
      app.badgeCount = count;
      if (process.platform === 'win32') {
        if (count > 0) {
          browserWindow.setOverlayIcon(path.resolve(__dirname, '..', 'overlay-icon.png'), `You have ${count} new messages.`);
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
    } catch (error) {
      console.log(error); // eslint-disable-line no-console
    }
  });
  // Handle audio & notification preferences
  if (shouldMuteAudio !== undefined) {
    view.webContents.audioMuted = shouldMuteAudio;
  }
  view.webContents.once('did-stop-loading', () => {
    view.webContents.send('should-pause-notifications-changed', workspace.disableNotifications || shouldPauseNotifications);
  });
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  views[workspace.id] = view;
  if (workspace.active) {
    browserWindow.setBrowserView(view);
    const contentSize = browserWindow.getContentSize();
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 1.
    view.setBounds(getViewBounds(contentSize));
    view.setAutoResize({
      width: true,
      height: true,
    });
  }
  const initialUrl = (rememberLastPageVisited && workspace.lastUrl) || workspace.homeUrl;
  // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 2.
  adjustUserAgentByUrl(view.webContents, initialUrl);
  // start wiki on startup, or on sub-wiki creation
  await wikiStartup(workspace);
  view.webContents.loadURL(initialUrl);
};
// @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
export const getView = (id: any) => views[id];
// @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
export const onEachView = (functionToRun: any) => Object.keys(views).forEach((key) => functionToRun(views[key]));
export const setActiveView = (browserWindow: any, id: any) => {
  // stop find in page when switching workspaces
  const currentView = browserWindow.getBrowserView();
  if (currentView) {
    currentView.webContents.stopFindInPage('clearSelection');
    browserWindow.send('close-find-in-page');
  }
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (views[id] == undefined) {
    addView(browserWindow, getWorkspace(id));
  } else {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const view = views[id];
    browserWindow.setBrowserView(view);
    const contentSize = browserWindow.getContentSize();
    if (getWorkspaceMeta(id).didFailLoad) {
      view.setBounds(getViewBounds(contentSize, false, 0, 0)); // hide browserView to show error message
    } else {
      // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 1.
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
    browserWindow.setTitle(view.webContents.getTitle());
  }
};
export const removeView = (id: any) => {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const view = views[id];
  session.fromPartition(`persist:${id}`).clearStorageData();
  if (view != undefined) {
    view.destroy();
  }
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  delete views[id];
};
export const setViewsAudioPref = (_shouldMuteAudio?: boolean) => {
  if (_shouldMuteAudio !== undefined) {
    shouldMuteAudio = _shouldMuteAudio;
  }
  Object.keys(views).forEach((id) => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const view = views[id];
    if (view != undefined) {
      const workspace = getWorkspace(id);
      view.webContents.audioMuted = workspace.disableAudio || shouldMuteAudio;
    }
  });
};
export const setViewsNotificationsPref = (_shouldPauseNotifications?: boolean) => {
  if (_shouldPauseNotifications !== undefined) {
    shouldPauseNotifications = _shouldPauseNotifications;
  }
  Object.keys(views).forEach((id) => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const view = views[id];
    if (view != undefined) {
      const workspace = getWorkspace(id);
      view.webContents.send('should-pause-notifications-changed', Boolean(workspace.disableNotifications || shouldPauseNotifications));
    }
  });
};
export const hibernateView = (id: any) => {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (views[id] != undefined) {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    views[id].destroy();
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    views[id] = null;
  }
};
export const reloadViewsDarkReader = () => {
  Object.keys(views).forEach((id) => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const view = views[id];
    if (view != undefined) {
      view.webContents.send('reload-dark-reader');
    }
  });
};
export const reloadViewsWebContentsIfDidFailLoad = () => {
  const metas = getWorkspaceMetas();
  Object.keys(metas).forEach((id) => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (!metas[id].didFailLoad) {
      return;
    }
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const view = views[id];
    if (view != undefined) {
      view.webContents.reload();
    }
  });
};
export const reloadViewsWebContents = () => {
  const metas = getWorkspaceMetas();
  Object.keys(metas).forEach((id) => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const view = views[id];
    if (view != undefined) {
      view.webContents.reload();
    }
  });
};
export const getActiveBrowserView = () => {
  const workspace = getActiveWorkspace();
  // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
  return getView(workspace.id);
};
export const realignActiveView = (browserWindow: any, activeId: any) => {
  const view = browserWindow.getBrowserView();
  if (view && view.webContents) {
    const contentSize = browserWindow.getContentSize();
    if (getWorkspaceMeta(activeId).didFailLoad) {
      view.setBounds(getViewBounds(contentSize, false, 0, 0)); // hide browserView to show error message
    } else {
      // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 1.
      view.setBounds(getViewBounds(contentSize));
    }
  }
};
