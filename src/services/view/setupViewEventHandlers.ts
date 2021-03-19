/* eslint-disable unicorn/consistent-destructuring */
import { app, BrowserView, ipcMain, WebContents, shell, NativeImage, BrowserWindowConstructorOptions, BrowserWindow } from 'electron';
import path from 'path';
import fsExtra from 'fs-extra';

import { IWorkspace } from '@services/workspaces/interface';
import getViewBounds from '@services/libs/get-view-bounds';
import { extractDomain, isInternalUrl } from '@services/libs/url';
import { buildResourcePath } from '@services/constants/paths';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames, IBrowserViewMetaData } from '@services/windows/WindowProperties';
import { container } from '@services/container';
import { NotificationChannel, ViewChannel, WindowChannel } from '@/constants/channels';

export interface IViewContext {
  workspace: IWorkspace;
  shouldPauseNotifications: boolean;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
}

export interface IViewMeta {
  forceNewWindow: boolean;
}

/**
 * Bind workspace related event handler to view.webContent
 */
export default function setupViewEventHandlers(
  view: BrowserView,
  browserWindow: BrowserWindow,
  { workspace, shouldPauseNotifications, sharedWebPreferences }: IViewContext,
): void {
  // metadata and state about current BrowserView
  const viewMeta: IViewMeta = {
    forceNewWindow: false,
  };
  // listeners to change meta from renderer process and services
  // if viewMeta.forceNewWindow = true
  // the next external link request will be opened in new window
  ipcMain.handle('set-view-meta-force-new-window', (_event, value: boolean) => {
    viewMeta.forceNewWindow = value;
  });

  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  view.webContents.once('did-stop-loading', () => {});
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
    if (
      workspaceObject.active &&
      typeof workspaceService.getMetaData(workspace.id).didFailLoadErrorMessage === 'string' &&
      browserWindow !== undefined &&
      !browserWindow.isDestroyed()
    ) {
      // fix https://github.com/atomery/singlebox/issues/228
      const contentSize = browserWindow.getContentSize();
      view.setBounds(getViewBounds(contentSize as [number, number]));
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
    workspaceService.updateMetaData(workspace.id, {
      isLoading: false,
    });
    const currentUrl = view.webContents.getURL();
    void workspaceService.update(workspace.id, {
      lastUrl: currentUrl,
    });
    // fix https://github.com/atomery/webcatalog/issues/870
    workspaceViewService.realignActiveWorkspace();
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
      if (workspaceObject.active && browserWindow !== undefined && !browserWindow.isDestroyed()) {
        // fix https://github.com/atomery/singlebox/issues/228
        const contentSize = browserWindow.getContentSize();
        view.setBounds(getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
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
      windowService.sendToAllWindows(WindowChannel.updateCanGoBack, view.webContents.canGoBack());
      windowService.sendToAllWindows(WindowChannel.updateCanGoForward, view.webContents.canGoForward());
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
      windowService.sendToAllWindows(WindowChannel.updateCanGoBack, view.webContents.canGoBack());
      windowService.sendToAllWindows(WindowChannel.updateCanGoForward, view.webContents.canGoForward());
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
      browserWindow.setTitle(title);
    }
  });

  // TODO: refactor to setWindowOpenHandler
  //   view.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => {
  //     action: "deny";
  // } | {
  //     action: "allow";
  //     overrideBrowserWindowOptions?: BrowserWindowConstructorOptions | undefined;
  // })
  view.webContents.on(
    'new-window',
    (
      _event: Electron.NewWindowWebContentsEvent,
      nextUrl: string,
      _frameName: string,
      disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
      options: BrowserWindowConstructorOptions,
      _additionalFeatures: string[],
      _referrer: Electron.Referrer,
      _postBody: Electron.PostBody,
    ) =>
      handleNewWindow(_event, nextUrl, _frameName, disposition, options, _additionalFeatures, _referrer, _postBody, {
        workspace,
        sharedWebPreferences,
        view,
        meta: viewMeta,
      }),
  );
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
          const icon = NativeImage.createFromPath(path.resolve(buildResourcePath, 'overlay-icon.png'));
          browserWindow.setOverlayIcon(icon, `You have ${count} new messages.`);
        } else {
          // eslint-disable-next-line unicorn/no-null
          browserWindow.setOverlayIcon(null, '');
        }
      }
    });
  }
  // Find In Page
  view.webContents.on('found-in-page', (_event, result) => {
    windowService.sendToAllWindows(ViewChannel.updateFindInPageMatches, result.activeMatchOrdinal, result.matches);
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

export interface INewWindowContext {
  view: BrowserView;
  meta: IViewMeta;
  workspace: IWorkspace;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
}

function handleNewWindow(
  event: Electron.NewWindowWebContentsEvent,
  nextUrl: string,
  _frameName: string,
  disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
  options: BrowserWindowConstructorOptions,
  _additionalFeatures: string[],
  _referrer: Electron.Referrer,
  _postBody: Electron.PostBody,
  newWindowContext: INewWindowContext,
): void {
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const { view, workspace, sharedWebPreferences } = newWindowContext;

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
    const browserViewMetaData: IBrowserViewMetaData = {
      isPopup: true,
      ...(JSON.parse(sharedWebPreferences?.additionalArguments?.[1] ?? '{}') as IBrowserViewMetaData),
    };
    const metadataConfig = {
      additionalArguments: [WindowNames.newWindow, JSON.stringify(browserViewMetaData)],
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    };
    const newOptions: BrowserWindowConstructorOptions = cmdClick
      ? {
          show: true,
          width: 1200,
          height: 800,
          webPreferences: { ...sharedWebPreferences, ...metadataConfig },
        }
      : { ...options, width: 1200, height: 800, webPreferences: metadataConfig };
    const popupWin = new BrowserWindow(newOptions);
    popupWin.setMenuBarVisibility(false);
    popupWin.webContents.on(
      'new-window',
      (
        _event: Electron.NewWindowWebContentsEvent,
        nextUrl: string,
        _frameName: string,
        disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
        options: BrowserWindowConstructorOptions,
        _additionalFeatures: string[],
        _referrer: Electron.Referrer,
        _postBody: Electron.PostBody,
      ) => handleNewWindow(_event, nextUrl, _frameName, disposition, options, _additionalFeatures, _referrer, _postBody, newWindowContext),
    );
    // if 'new-window' is triggered with Cmd+Click
    // url is not loaded automatically
    // https://github.com/atomery/webcatalog/issues/842
    if (cmdClick) {
      void popupWin.loadURL(nextUrl);
    }
    event.newGuest = popupWin;
  };
  // Conditions are listed by order of priority
  // if global.forceNewWindow = true
  // or regular new-window event
  // or if in Google Drive app, open Google Docs files internally https://github.com/atomery/webcatalog/issues/800
  // the next external link request will be opened in new window
  if (
    newWindowContext.meta.forceNewWindow ||
    disposition === 'new-window' ||
    disposition === 'default' ||
    (appDomain === 'drive.google.com' && nextDomain === 'docs.google.com')
  ) {
    newWindowContext.meta.forceNewWindow = false;
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
    void view.webContents.loadURL(nextUrl);
    return;
  }
  // open new window
  if (isInternalUrl(nextUrl, [appUrl, currentUrl])) {
    openInNewWindow();
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
    popupWin.webContents.on(
      'new-window',
      (
        _event: Electron.NewWindowWebContentsEvent,
        nextUrl: string,
        _frameName: string,
        disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
        options: BrowserWindowConstructorOptions,
        _additionalFeatures: string[],
        _referrer: Electron.Referrer,
        _postBody: Electron.PostBody,
      ) => handleNewWindow(_event, nextUrl, _frameName, disposition, options, _additionalFeatures, _referrer, _postBody, newWindowContext),
    );
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
    event.newGuest = popupWin;
  }
}
