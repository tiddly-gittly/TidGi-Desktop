import { app, BrowserView, ipcMain, WebContents, shell, Event as ElectronEvent, BrowserWindowConstructorOptions, BrowserWindow } from 'electron';
import path from 'path';
import fsExtra from 'fs-extra';

import { IWorkspace } from '@services/types';
import getViewBounds from '@services/libs/get-view-bounds';
import { extractDomain, isInternalUrl } from '@services/libs/url';
import { buildResourcePath } from '@services/constants/paths';

import { Preference } from '@services/preferences';
import { Workspace } from '@services/workspaces';
import { Window } from '@services/windows';
import { Wiki } from '@services/wiki';
import { Authentication } from '@services/auth';
import { container } from '@services/container';

export interface IViewContext {
  workspace: IWorkspace;
  shouldPauseNotifications: boolean;
}
export interface IViewModifier {
  adjustUserAgentByUrl: (_contents: WebContents, _url: string) => boolean;
}

/**
 * Bind workspace related event handler to view.webContent
 */
export default function setupViewEventHandlers(
  view: BrowserView,
  browserWindow: BrowserWindow,
  { workspace, shouldPauseNotifications }: IViewContext,
  { adjustUserAgentByUrl }: IViewModifier,
): void {
  const workspaceService = container.resolve(Workspace);
  const windowService = container.resolve(Window);
  const preferenceService = container.resolve(Preference);

  view.webContents.once('did-stop-loading', () => {
    view.webContents.send('should-pause-notifications-changed', workspace.disableNotifications || shouldPauseNotifications);
  });
  view.webContents.on('will-navigate', (event, nextUrl) => {
    // open external links in browser
    // https://github.com/atomery/webcatalog/issues/849#issuecomment-629587264
    // this behavior is likely to break many apps (eg Microsoft Teams)
    // apply this rule only to github.com for now
    const appUrl = workspaceService.get(workspace.id)?.homeUrl;
    const currentUrl = view.webContents.getURL();
    if (appUrl !== undefined) {
      const appDomain = extractDomain(appUrl);
      const currentDomain = extractDomain(currentUrl);
      if (
        appDomain !== undefined &&
        currentDomain !== undefined &&
        (appDomain.includes('github.com') || currentDomain.includes('github.com')) &&
        !isInternalUrl(nextUrl, [appUrl, currentUrl])
      ) {
        event.preventDefault();
        void shell.openExternal(nextUrl);
      }
      adjustUserAgentByUrl(view.webContents, nextUrl);
    }
  });
  view.webContents.on('did-start-loading', () => {
    const workspaceObject = workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active) {
      if (typeof workspaceService.getMetaData(workspace.id).didFailLoadErrorMessage === 'string') {
        // show browserView again when reloading after error
        // see did-fail-load event
        if (browserWindow !== undefined && !browserWindow.isDestroyed()) {
          // fix https://github.com/atomery/singlebox/issues/228
          const contentSize = browserWindow.getContentSize();
          // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 1.
          view.setBounds(getViewBounds(contentSize));
        }
      }
    }
    workspaceService.updateMetaData(workspace.id, {
      // eslint-disable-next-line unicorn/no-null
      didFailLoadErrorMessage: null,
      isLoading: true,
    });
  });
  view.webContents.on('did-stop-loading', () => {
    const workspaceObject = workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    // isLoading is now controlled by wiki-worker-manager.js
    // workspaceService.updateMetaData(workspace.id, {
    //   isLoading: false,
    // });
    if (workspaceObject.active) {
      windowService.sendToAllWindows('update-address', view.webContents.getURL(), false);
    }
    const currentUrl = view.webContents.getURL();
    void workspaceService.update(workspace.id, {
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
  view.webContents.on('did-fail-load', (_event, errorCode, errorDesc, _validateUrl, isMainFrame) => {
    const workspaceObject = workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (isMainFrame && errorCode < 0 && errorCode !== -3) {
      workspaceService.updateMetaData(workspace.id, {
        didFailLoadErrorMessage: errorDesc,
      });
      if (workspaceObject.active) {
        if (browserWindow !== undefined && !browserWindow.isDestroyed()) {
          // fix https://github.com/atomery/singlebox/issues/228
          const contentSize = browserWindow.getContentSize();
          view.setBounds(getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
        }
      }
    }
    // edge case to handle failed auth
    if (errorCode === -300 && view.webContents.getURL().length === 0) {
      void view.webContents.loadURL(workspaceObject.homeUrl);
    }
  });
  view.webContents.on('did-navigate', (_event, url) => {
    const workspaceObject = workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    // fix "Google Chat isn't supported on your current browser"
    // https://github.com/atomery/webcatalog/issues/820
    if (typeof url === 'string' && url.includes('error/browser-not-supported') && url.startsWith('https://chat.google.com')) {
      const reference = new URL(url).searchParams.get('ref') ?? '';
      void view.webContents.loadURL(`https://chat.google.com${reference}`);
    }
    if (workspaceObject.active) {
      windowService.sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      windowService.sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      windowService.sendToAllWindows('update-address', url, false);
    }
  });
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    const workspaceObject = workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active) {
      windowService.sendToAllWindows('update-can-go-back', view.webContents.canGoBack());
      windowService.sendToAllWindows('update-can-go-forward', view.webContents.canGoForward());
      windowService.sendToAllWindows('update-address', url, false);
    }
  });
  view.webContents.on('page-title-updated', (_event, title) => {
    const workspaceObject = workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active) {
      windowService.sendToAllWindows('update-title', title);
      browserWindow.setTitle(title);
    }
  });

  view.webContents.on('new-window', handleNewWindow);
  // Handle downloads
  // https://electronjs.org/docs/api/download-item
  view.webContents.session.on('will-download', (_event, item) => {
    const { askForDownloadPath, downloadPath } = preferenceService.getPreferences();
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
  if (preferenceService.get('unreadCountBadge')) {
    view.webContents.on('page-title-updated', (_event, title) => {
      const itemCountRegex = /[([{](\d*?)[)\]}]/;
      const match = itemCountRegex.exec(title);
      const incString = match !== null ? match[1] : '';
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      const inc = Number.parseInt(incString, 10) || 0;
      workspaceService.updateMetaData(workspace.id, {
        badgeCount: inc,
      });
      let count = 0;
      const workspaceMetaData = workspaceService.getAllMetaData();
      Object.values(workspaceMetaData).forEach((metaData) => {
        if (typeof metaData?.badgeCount === 'number') {
          count += metaData.badgeCount;
        }
      });
      app.badgeCount = count;
      if (process.platform === 'win32') {
        if (count > 0) {
          // TODO: seems this is not good?
          // @ts-expect-error should be Electron.NativeImage here
          browserWindow.setOverlayIcon(path.resolve(buildResourcePath, 'overlay-icon.png'), `You have ${count} new messages.`);
        } else {
          // eslint-disable-next-line unicorn/no-null
          browserWindow.setOverlayIcon(null, '');
        }
      }
    });
  }
  // Find In Page
  view.webContents.on('found-in-page', (_event, result) => {
    windowService.sendToAllWindows('update-find-in-page-matches', result.activeMatchOrdinal, result.matches);
  });
  // Link preview
  view.webContents.on('update-target-url', (_event, url) => {
    try {
      view.webContents.send('update-target-url', url);
    } catch (error) {
      console.log(error); // eslint-disable-line no-console
    }
  });
}

function handleNewWindow(
  event: ElectronEvent,
  view: BrowserView,
  nextUrl: string,
  _frameName: string,
  disposition: string,
  workspace: IWorkspace,
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'],
  options?: BrowserWindowConstructorOptions,
): void {
  const workspaceService = container.resolve(Workspace);
  const preferenceService = container.resolve(Preference);

  const appUrl = workspaceService.get(workspace.id)?.homeUrl;
  if (appUrl === undefined) {
    throw new Error(`Workspace ${workspace.id} not existed, or don't have homeUrl setting`);
  }
  const appDomain = extractDomain(appUrl);
  const currentUrl = view.webContents.getURL();
  const currentDomain = extractDomain(currentUrl);
  const nextDomain = extractDomain(nextUrl);
  const openInNewWindow = (): void => {
    // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
    event.preventDefault();
    // if 'new-window' is triggered with Cmd+Click
    // options is undefined
    // https://github.com/atomery/webcatalog/issues/842
    const cmdClick = options === undefined;
    const newOptions = cmdClick
      ? {
          show: true,
          width: 1200,
          height: 800,
          webPreferences: sharedWebPreferences,
        }
      : { ...options, width: 1200, height: 800 };
    const popupWin = new BrowserWindow(newOptions);
    // FIXME: WebCatalog internal value to determine whether BrowserWindow is popup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    popupWin.isPopup = true;
    popupWin.setMenuBarVisibility(false);
    popupWin.webContents.on('new-window', this.handleNewWindow);
    // fix Google prevents signing in because of security concerns
    // https://github.com/atomery/webcatalog/issues/455
    // https://github.com/meetfranz/franz/issues/1720#issuecomment-566460763
    // will-navigate doesn't trigger for loadURL, goBack, goForward
    // so user agent to needed to be double check here
    // not the best solution as page will be unexpectedly reloaded
    // but it won't happen very often
    popupWin.webContents.on('will-navigate', (_navigateEvent, url) => {
      adjustUserAgentByUrl(popupWin.webContents, url);
    });
    popupWin.webContents.on('did-navigate', (_navigateEvent, url) => {
      if (adjustUserAgentByUrl(popupWin.webContents, url)) {
        popupWin.webContents.reload();
      }
    });
    // if 'new-window' is triggered with Cmd+Click
    // url is not loaded automatically
    // https://github.com/atomery/webcatalog/issues/842
    if (cmdClick) {
      void popupWin.loadURL(nextUrl);
    }
    // FIXME: type definition of event
    // @ts-expect-error Property 'newGuest' does not exist on type 'Event'.ts(2339)
    event.newGuest = popupWin;
  };
  // Conditions are listed by order of priority
  // if global.forceNewWindow = true
  // or regular new-window event
  // or if in Google Drive app, open Google Docs files internally https://github.com/atomery/webcatalog/issues/800
  // the next external link request will be opened in new window
  if (
    // FIXME: WebCatalog internal value to determine whether BrowserWindow is popup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    global.forceNewWindow === true ||
    disposition === 'new-window' ||
    disposition === 'default' ||
    (appDomain === 'drive.google.com' && nextDomain === 'docs.google.com')
  ) {
    global.forceNewWindow = false;
    openInNewWindow();
    return;
  }
  // load in same window
  if (
    // Google: Add account
    nextDomain === 'accounts.google.com' ||
    // Google: Switch account
    (typeof nextDomain === 'string' &&
      nextDomain.indexOf('google.com') > 0 &&
      isInternalUrl(nextUrl, [appUrl, currentUrl]) &&
      (nextUrl.includes('authuser=') || // https://drive.google.com/drive/u/1/priority?authuser=2 (has authuser query)
        /\/u\/\d+\/{0,1}$/.test(nextUrl))) || // https://mail.google.com/mail/u/1/ (ends with /u/1/)
    // https://github.com/atomery/webcatalog/issues/315
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    ((appDomain?.includes('asana.com') || currentDomain?.includes('asana.com')) && nextDomain?.includes('asana.com'))
  ) {
    event.preventDefault();
    adjustUserAgentByUrl(view.webContents, nextUrl);
    void view.webContents.loadURL(nextUrl);
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
  if (appDomain === 'roamresearch.com' && nextDomain !== undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
    event.preventDefault();
    void shell.openExternal(nextUrl);
    // mock window
    // close as soon as it did-navigate
    const newOptions: BrowserWindowConstructorOptions = {
      ...options,
      show: false,
    };
    const popupWin = new BrowserWindow(newOptions);
    // WebCatalog internal value to determine whether BrowserWindow is popup
    // FIXME: WebCatalog internal value to determine whether BrowserWindow is popup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    popupWin.isPopup = true;
    // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
    popupWin.once('did-navigate', () => {
      popupWin.close();
    });
    // FIXME: type definition of event
    // @ts-expect-error Property 'newGuest' does not exist on type 'Event'.ts(2339)
    event.newGuest = popupWin;
    return;
  }
  // open external url in browser
  if (nextDomain !== undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
    event.preventDefault();
    void shell.openExternal(nextUrl);
    return;
  }
  // App tries to open external link using JS
  // nextURL === 'about:blank' but then window will redirect to the external URL
  // https://github.com/quanglam2807/webcatalog/issues/467#issuecomment-569857721
  if (nextDomain === null && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
    event.preventDefault();
    const newOptions = {
      ...options,
      show: false,
    };
    const popupWin = new BrowserWindow(newOptions);
    popupWin.setMenuBarVisibility(false);
    popupWin.webContents.on('new-window', handleNewWindow);
    popupWin.webContents.once('will-navigate', (_event, url) => {
      // if the window is used for the current app, then use default behavior
      if (isInternalUrl(url, [appUrl, currentUrl])) {
        popupWin.show();
      } else {
        // if not, open in browser
        event.preventDefault();
        void shell.openExternal(url);
        popupWin.close();
      }
    });
    // FIXME: type definition of event
    // @ts-expect-error Property 'newGuest' does not exist on type 'Event'.ts(2339)
    event.newGuest = popupWin;
  }
}
