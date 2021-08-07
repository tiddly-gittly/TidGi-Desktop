/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable unicorn/consistent-destructuring */
import { app, BrowserView, shell, NativeImage, BrowserWindowConstructorOptions, BrowserWindow } from 'electron';
import path from 'path';
import fsExtra from 'fs-extra';

import { IWorkspace } from '@services/workspaces/interface';
import getViewBounds from '@services/libs/getViewBounds';
import { extractDomain, isInternalUrl } from '@/helpers/url';
import { buildResourcePath } from '@/constants/paths';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IPreferenceService } from '@services/preferences/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames, IBrowserViewMetaData } from '@services/windows/WindowProperties';
import { container } from '@services/container';
import { MetaDataChannel, ViewChannel, WindowChannel } from '@/constants/channels';
import { logger } from '@services/libs/log';
import { getLocalHostUrlWithActualIP } from '@services/libs/url';
import { LOAD_VIEW_MAX_RETRIES } from '@/constants/parameters';

export interface IViewContext {
  workspace: IWorkspace;
  shouldPauseNotifications: boolean;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
  initialUrl: string;
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
  { workspace, sharedWebPreferences, initialUrl }: IViewContext,
): void {
  // metadata and state about current BrowserView
  const viewMeta: IViewMeta = {
    forceNewWindow: false,
  };

  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  view.webContents.once('did-stop-loading', () => {});
  view.webContents.on('did-start-loading', async () => {
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (
      workspaceObject.active &&
      typeof (await workspaceService.getMetaData(workspace.id)).didFailLoadErrorMessage === 'string' &&
      browserWindow !== undefined &&
      !browserWindow.isDestroyed()
    ) {
      // fix https://github.com/atomery/singlebox/issues/228
      const contentSize = browserWindow.getContentSize();
      view.setBounds(await getViewBounds(contentSize as [number, number]));
    }
    await workspaceService.updateMetaData(workspace.id, {
      // eslint-disable-next-line unicorn/no-null
      didFailLoadErrorMessage: null,
      isLoading: true,
    });
  });
  view.webContents.on('did-stop-loading', async () => {
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    const currentUrl = view.webContents.getURL();
    await workspaceService.update(workspace.id, {
      lastUrl: currentUrl,
    });
    // fix https://github.com/atomery/webcatalog/issues/870
    await workspaceViewService.realignActiveWorkspace();
    await workspaceService.updateMetaData(workspace.id, {
      isLoading: false,
    });
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
  // https://github.com/webcatalog/neutron/blob/3d9e65c255792672c8bc6da025513a5404d98730/main-src/libs/views.js#L397
  view.webContents.on('did-fail-load', async (_event, errorCode, errorDesc, _validateUrl, isMainFrame) => {
    const [workspaceObject, workspaceMetaData] = await Promise.all([workspaceService.get(workspace.id), workspaceService.getMetaData(workspace.id)]);
    const didFailLoadTimes = workspaceMetaData.didFailLoadTimes ?? 0;
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (isMainFrame && errorCode < 0 && errorCode !== -3) {
      // Fix nodejs wiki start slow on system startup, which cause `-102 ERR_CONNECTION_REFUSED` even if wiki said it is booted, we have to retry several times
      if (
        errorCode === -102 &&
        view.webContents.getURL().length > 0 &&
        workspaceObject.homeUrl.startsWith('http') &&
        didFailLoadTimes < LOAD_VIEW_MAX_RETRIES
      ) {
        setTimeout(async () => {
          await workspaceService.updateMetaData(workspace.id, {
            didFailLoadTimes: didFailLoadTimes + 1,
          });
          await view.webContents.loadURL(initialUrl);
        }, 200);
        return;
      }
      await workspaceService.updateMetaData(workspace.id, {
        didFailLoadErrorMessage: `${errorCode} ${errorDesc} , retryTimes: ${didFailLoadTimes}`,
      });
      if (workspaceObject.active && browserWindow !== undefined && !browserWindow.isDestroyed()) {
        // fix https://github.com/atomery/singlebox/issues/228
        const contentSize = browserWindow.getContentSize();
        view.setBounds(await getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      }
    }
    // edge case to handle failed auth, use setTimeout to prevent infinite loop
    if (errorCode === -300 && view.webContents.getURL().length === 0 && workspaceObject.homeUrl.startsWith('http')) {
      setTimeout(() => {
        void view.webContents.loadURL(getLocalHostUrlWithActualIP(workspaceObject.homeUrl));
      }, 1000);
    }
  });
  view.webContents.on('did-navigate', async (_event, url) => {
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active) {
      await windowService.sendToAllWindows(WindowChannel.updateCanGoBack, view.webContents.canGoBack());
      await windowService.sendToAllWindows(WindowChannel.updateCanGoForward, view.webContents.canGoForward());
    }
  });
  view.webContents.on('did-navigate-in-page', async (_event, url) => {
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active) {
      await windowService.sendToAllWindows(WindowChannel.updateCanGoBack, view.webContents.canGoBack());
      await windowService.sendToAllWindows(WindowChannel.updateCanGoForward, view.webContents.canGoForward());
    }
  });
  view.webContents.on('page-title-updated', async (_event, title) => {
    const workspaceObject = await workspaceService.get(workspace.id);
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

  view.webContents.on(
    'new-window',
    async (
      _event: Electron.NewWindowWebContentsEvent,
      nextUrl: string,
      _frameName: string,
      disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
      options: BrowserWindowConstructorOptions,
      _additionalFeatures: string[],
      _referrer: Electron.Referrer,
      _postBody: Electron.PostBody,
    ) =>
      await handleNewWindow(_event, nextUrl, _frameName, disposition, options, _additionalFeatures, _referrer, _postBody, {
        workspace,
        sharedWebPreferences,
        view,
        meta: viewMeta,
      }),
  );
  // Handle downloads
  // https://electronjs.org/docs/api/download-item
  view.webContents.session.on('will-download', async (_event, item) => {
    const { askForDownloadPath, downloadPath } = await preferenceService.getPreferences();
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
  void preferenceService.get('unreadCountBadge').then((unreadCountBadge) => {
    if (unreadCountBadge) {
      view.webContents.on('page-title-updated', async (_event, title) => {
        const itemCountRegex = /[([{](\d*?)[)\]}]/;
        const match = itemCountRegex.exec(title);
        const incString = match !== null ? match[1] : '';
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const inc = Number.parseInt(incString, 10) || 0;
        await workspaceService.updateMetaData(workspace.id, {
          badgeCount: inc,
        });
        let count = 0;
        const workspaceMetaData = await workspaceService.getAllMetaData();
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
  });
  // Find In Page
  view.webContents.on('found-in-page', async (_event, result) => {
    await windowService.sendToAllWindows(ViewChannel.updateFindInPageMatches, result.activeMatchOrdinal, result.matches);
  });
  // Link preview
  view.webContents.on('update-target-url', (_event, url) => {
    try {
      view.webContents.send('update-target-url', url);
    } catch (error) {
      logger.warn(error); // eslint-disable-line no-console
    }
  });
}

export interface INewWindowContext {
  view: BrowserView;
  meta: IViewMeta;
  workspace: IWorkspace;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
}

async function handleNewWindow(
  event: Electron.NewWindowWebContentsEvent,
  nextUrl: string,
  _frameName: string,
  disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
  options: BrowserWindowConstructorOptions,
  _additionalFeatures: string[],
  _referrer: Electron.Referrer,
  _postBody: Electron.PostBody,
  newWindowContext: INewWindowContext,
): Promise<void> {
  const nextDomain = extractDomain(nextUrl);
  // open external url in browser
  if (nextDomain !== undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
    event.preventDefault();
    void shell.openExternal(nextUrl);
    return;
  }
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const { view, workspace, sharedWebPreferences } = newWindowContext;
  let appUrl = (await workspaceService.get(workspace.id))?.homeUrl;
  if (appUrl === undefined) {
    throw new Error(`Workspace ${workspace.id} not existed, or don't have homeUrl setting`);
  }
  appUrl = getLocalHostUrlWithActualIP(appUrl);
  const appDomain = extractDomain(appUrl);
  const currentUrl = view.webContents.getURL();
  const openInNewWindow = (): void => {
    // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
    event.preventDefault();
    // if 'new-window' is triggered with Cmd+Click
    // options is undefined
    // https://github.com/atomery/webcatalog/issues/842
    const cmdClick = options === undefined;
    const browserViewMetaData: IBrowserViewMetaData = {
      isPopup: true,
      ...(JSON.parse(decodeURIComponent(sharedWebPreferences?.additionalArguments?.[1] ?? '{}')) as IBrowserViewMetaData),
    };
    const metadataConfig = {
      additionalArguments: [
        `${MetaDataChannel.browserViewMetaData}${WindowNames.newWindow}`,
        `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(browserViewMetaData))}`,
      ],
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
      async (
        _event: Electron.NewWindowWebContentsEvent,
        nextUrl: string,
        _frameName: string,
        disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
        options: BrowserWindowConstructorOptions,
        _additionalFeatures: string[],
        _referrer: Electron.Referrer,
        _postBody: Electron.PostBody,
      ) => await handleNewWindow(_event, nextUrl, _frameName, disposition, options, _additionalFeatures, _referrer, _postBody, newWindowContext),
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
  // if (
  //   // Google: Add account
  //   nextDomain === 'accounts.google.com' ||
  //   // Google: Switch account
  //   (typeof nextDomain === 'string' &&
  //     nextDomain.indexOf('google.com') > 0 &&
  //     isInternalUrl(nextUrl, [appUrl, currentUrl]) &&
  //     (nextUrl.includes('authuser=') || // https://drive.google.com/drive/u/1/priority?authuser=2 (has authuser query)
  //       /\/u\/\d+\/{0,1}$/.test(nextUrl))) || // https://mail.google.com/mail/u/1/ (ends with /u/1/)
  //   // https://github.com/atomery/webcatalog/issues/315
  //   // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
  //   ((appDomain?.includes('asana.com') || currentDomain?.includes('asana.com')) && nextDomain?.includes('asana.com'))
  // ) {
  //   event.preventDefault();
  //   void view.webContents.loadURL(nextUrl);
  //   return;
  // }
  // // open new window
  // if (isInternalUrl(nextUrl, [appUrl, currentUrl])) {
  //   openInNewWindow();
  //   return;
  // }

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
      async (
        _event: Electron.NewWindowWebContentsEvent,
        nextUrl: string,
        _frameName: string,
        disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
        options: BrowserWindowConstructorOptions,
        _additionalFeatures: string[],
        _referrer: Electron.Referrer,
        _postBody: Electron.PostBody,
      ) => await handleNewWindow(_event, nextUrl, _frameName, disposition, options, _additionalFeatures, _referrer, _postBody, newWindowContext),
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
    event.newGuest = popupWin;
  }
}
