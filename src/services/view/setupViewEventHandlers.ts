/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable unicorn/consistent-destructuring */
import { app, BrowserView, BrowserWindow, BrowserWindowConstructorOptions, nativeImage, shell } from 'electron';
import windowStateKeeper from 'electron-window-state';
import fsExtra from 'fs-extra';
import path from 'path';

import { buildResourcePath } from '@/constants/paths';
import { extractDomain, isInternalUrl } from '@/helpers/url';
import getViewBounds from '@services/libs/getViewBounds';
import { IWorkspace } from '@services/workspaces/interface';

import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { MetaDataChannel, ViewChannel, WindowChannel } from '@/constants/channels';
import { isWin } from '@/helpers/system';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { getLocalHostUrlWithActualIP, isSameOrigin } from '@services/libs/url';
import { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { IBrowserViewMetaData, windowDimension, WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { throttle } from 'lodash';

export interface IViewContext {
  loadInitialUrlWithCatch: () => Promise<void>;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
  shouldPauseNotifications: boolean;
  workspace: IWorkspace;
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
  { workspace, sharedWebPreferences, loadInitialUrlWithCatch }: IViewContext,
): void {
  // metadata and state about current BrowserView
  const viewMeta: IViewMeta = {
    forceNewWindow: false,
  };

  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  view.webContents.on('did-start-loading', async () => {
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active && (await workspaceService.workspaceDidFailLoad(workspace.id)) && browserWindow !== undefined && !browserWindow.isDestroyed()) {
      // fix https://github.com/webcatalog/singlebox-legacy/issues/228
      const contentSize = browserWindow.getContentSize();
      view.setBounds(await getViewBounds(contentSize as [number, number]));
    }
    await workspaceService.updateMetaData(workspace.id, {
      // eslint-disable-next-line unicorn/no-null
      didFailLoadErrorMessage: null,
      isLoading: true,
    });
  });
  view.webContents.on('will-navigate', async (event, newUrl) => {
    const currentUrl = view.webContents.getURL();
    if (isSameOrigin(newUrl, currentUrl)) {
      return;
    }
    const { homeUrl, lastUrl } = workspace;
    const [hostReplacedHomeUrl, hostReplacedLastUrl] = await Promise.all([
      getLocalHostUrlWithActualIP(homeUrl),
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      lastUrl ? getLocalHostUrlWithActualIP(lastUrl) : undefined,
    ]);
    if (
      isSameOrigin(newUrl, homeUrl) ||
      isSameOrigin(newUrl, hostReplacedHomeUrl) ||
      isSameOrigin(newUrl, lastUrl) ||
      isSameOrigin(newUrl, hostReplacedLastUrl)
    ) {
      return;
    }
    logger.debug('will-navigate openExternal', { newUrl, currentUrl, homeUrl, lastUrl, hostReplacedHomeUrl, hostReplacedLastUrl });
    await shell.openExternal(newUrl).catch((error) => logger.error(`will-navigate openExternal error ${(error as Error).message}`, error));
    // if is an external website
    event.preventDefault();
    // TODO: do this until https://github.com/electron/electron/issues/31783 fixed
    await view.webContents.loadURL(currentUrl);
    // event.stopPropagation();
  });
  view.webContents.on('did-navigate-in-page', async () => {
    await workspaceViewService.updateLastUrl(workspace.id, view);
  });

  const throttledDidFinishedLoad = throttle(async () => {
    // if have error, don't realignActiveWorkspace, which will hide the error message
    if (await workspaceService.workspaceDidFailLoad(workspace.id)) {
      return;
    }
    if (view.webContents === null) {
      return;
    }
    logger.debug(`throttledDidFinishedLoad() workspace.id: ${workspace.id}, now workspaceViewService.realignActiveWorkspace() then set isLoading to false`);
    // focus on initial load
    // https://github.com/atomery/webcatalog/issues/398
    if (workspace.active && !browserWindow.isDestroyed() && browserWindow.isFocused() && !view.webContents.isFocused()) {
      view.webContents.focus();
    }
    // fix https://github.com/atomery/webcatalog/issues/870
    await workspaceViewService.realignActiveWorkspace();
    // update isLoading to false when load succeed
    await workspaceService.updateMetaData(workspace.id, {
      isLoading: false,
    });
  }, 2000);
  view.webContents.on('did-finish-load', () => {
    logger.debug('did-finish-load called');
    void throttledDidFinishedLoad();
  });
  view.webContents.on('did-stop-loading', () => {
    logger.debug('did-stop-loading called');
    void throttledDidFinishedLoad();
  });
  view.webContents.on('dom-ready', () => {
    logger.debug('dom-ready called');
    void throttledDidFinishedLoad();
  });

  // https://electronjs.org/docs/api/web-contents#event-did-fail-load
  // https://github.com/webcatalog/neutron/blob/3d9e65c255792672c8bc6da025513a5404d98730/main-src/libs/views.js#L397
  view.webContents.on('did-fail-load', async (_event, errorCode, errorDesc, _validateUrl, isMainFrame) => {
    const [workspaceObject, workspaceDidFailLoad] = await Promise.all([
      workspaceService.get(workspace.id),
      workspaceService.workspaceDidFailLoad(workspace.id),
    ]);
    // this event might be triggered
    // even after the workspace obj and BrowserView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceDidFailLoad) {
      return;
    }
    if (isMainFrame && errorCode < 0 && errorCode !== -3) {
      // Fix nodejs wiki start slow on system startup, which cause `-102 ERR_CONNECTION_REFUSED` even if wiki said it is booted, we have to retry several times
      if (errorCode === -102 && view.webContents.getURL().length > 0 && workspaceObject.homeUrl.startsWith('http')) {
        setTimeout(async () => {
          await loadInitialUrlWithCatch();
        }, 1000);
        return;
      }
      await workspaceService.updateMetaData(workspace.id, {
        isLoading: false,
        didFailLoadErrorMessage: `${errorCode} ${errorDesc}`,
      });
      if (workspaceObject.active && browserWindow !== undefined && !browserWindow.isDestroyed()) {
        // fix https://github.com/atomery/singlebox/issues/228
        const contentSize = browserWindow.getContentSize();
        view.setBounds(await getViewBounds(contentSize as [number, number], false, 0, 0)); // hide browserView to show error message
      }
    }
    // edge case to handle failed auth, use setTimeout to prevent infinite loop
    if (errorCode === -300 && view.webContents.getURL().length === 0 && workspaceObject.homeUrl.startsWith('http')) {
      setTimeout(async () => {
        await loadInitialUrlWithCatch();
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

  view.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) =>
    handleNewWindow(
      details.url,
      {
        workspace,
        sharedWebPreferences,
        view,
        meta: viewMeta,
      },
      details.disposition,
      view.webContents,
    )
  );
  // Handle downloads
  // https://electronjs.org/docs/api/download-item
  view.webContents.session.on('will-download', async (_event, item) => {
    const { askForDownloadPath, downloadPath } = await preferenceService.getPreferences();
    // Set the save path, making Electron not to prompt a save dialog.
    if (askForDownloadPath) {
      // set preferred path for save dialog
      const options = {
        ...item.getSaveDialogOptions(),
        defaultPath: path.join(downloadPath, item.getFilename()),
      };
      item.setSaveDialogOptions(options);
    } else {
      const finalFilePath = path.join(downloadPath, item.getFilename());
      if (!fsExtra.existsSync(finalFilePath)) {
        // eslint-disable-next-line no-param-reassign
        item.savePath = finalFilePath;
      }
    }
  });
  // Unread count badge
  void preferenceService.get('unreadCountBadge').then((unreadCountBadge) => {
    if (unreadCountBadge) {
      view.webContents.on('page-title-updated', async (_event, title) => {
        const itemCountRegex = /[([{](\d*?)[)\]}]/;
        const match = itemCountRegex.exec(title);
        const incString = match === null ? '' : match[1];
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
        if (isWin) {
          if (count > 0) {
            const icon = nativeImage.createFromPath(path.resolve(buildResourcePath, 'overlay-icon.png'));
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
  meta: IViewMeta;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
  view: BrowserView;
  workspace: IWorkspace;
}

function handleNewWindow(
  nextUrl: string,
  newWindowContext: INewWindowContext,
  disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
  parentWebContents: Electron.WebContents,
):
  | {
    action: 'deny';
  }
  | {
    action: 'allow';
    overrideBrowserWindowOptions?: Electron.BrowserWindowConstructorOptions | undefined;
  }
{
  logger.debug(`Getting url that will open externally`, { nextUrl });
  // don't show useless blank page
  if (nextUrl.startsWith('about:blank')) {
    logger.debug('ignore about:blank');
    return { action: 'deny' };
  }
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const nextDomain = extractDomain(nextUrl);
  /**
   * Handles in-wiki file opening
   *
   * `file://` may resulted in `nextDomain` being `about:blank#blocked`, so we use `open://` instead. But in MacOS it seem to works fine in most cases. Just leave open:// in case as a fallback for users.
   *
   * For  file:/// in-app assets loading., see commonInit() in `src/main.ts`.
   */
  if (nextUrl.startsWith('open://') || nextUrl.startsWith('file://')) {
    logger.info('This url will open file', { nextUrl, nextDomain, disposition });
    const filePath = decodeURI(nextUrl.replace('open://', '').replace('file://', ''));
    const fileExists = fsExtra.existsSync(filePath);
    logger.info(`This file (decodeURI) ${fileExists ? '' : 'not '}exists`, { filePath });
    if (fileExists) {
      void shell.openPath(filePath);
      return {
        action: 'deny',
      };
    }
    logger.info(`try find file relative to workspace folder`);
    void workspaceService.getActiveWorkspace().then((workspace) => {
      if (workspace !== undefined) {
        const filePathInWorkspaceFolder = path.resolve(workspace.wikiFolderLocation, filePath);
        const fileExistsInWorkspaceFolder = fsExtra.existsSync(filePathInWorkspaceFolder);
        logger.info(`This file ${fileExistsInWorkspaceFolder ? '' : 'not '}exists in workspace folder.`, { filePathInWorkspaceFolder });
        if (fileExistsInWorkspaceFolder) {
          void shell.openPath(filePathInWorkspaceFolder);
        }
      }
    });
    return {
      action: 'deny',
    };
  }
  // open external url in browser
  if (nextDomain !== undefined && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
    logger.debug('handleNewWindow() openExternal', { nextUrl, nextDomain, disposition });
    void shell.openExternal(nextUrl).catch((error) => logger.error(`handleNewWindow() openExternal error ${(error as Error).message}`, error));
    return {
      action: 'deny',
    };
  }
  logger.debug('handleNewWindow()', { newWindowContext });
  const { view, workspace, sharedWebPreferences } = newWindowContext;
  const currentUrl = view.webContents.getURL();
  /** Conditions are listed by order of priority
  if global.forceNewWindow = true
  or regular new-window event
  or if in Google Drive app, open Google Docs files internally https://github.com/atomery/webcatalog/issues/800
  the next external link request will be opened in new window */
  const clickOpenNewWindow = newWindowContext.meta.forceNewWindow || disposition === 'new-window' || disposition === 'default';
  /** App tries to open external link using JS
  nextURL === 'about:blank' but then window will redirect to the external URL
  https://github.com/quanglam2807/webcatalog/issues/467#issuecomment-569857721 */
  const isExternalLinkUsingJS = nextDomain === null && (disposition === 'foreground-tab' || disposition === 'background-tab');
  if (clickOpenNewWindow || isExternalLinkUsingJS) {
    // https://gist.github.com/Gvozd/2cec0c8c510a707854e439fb15c561b0
    // if 'new-window' is triggered with Cmd+Click
    // options is undefined
    // https://github.com/atomery/webcatalog/issues/842
    const browserViewMetaData: IBrowserViewMetaData = {
      isPopup: true,
      ...(JSON.parse(
        decodeURIComponent(sharedWebPreferences?.additionalArguments?.[1]?.replace(MetaDataChannel.browserViewMetaData, '') ?? '{}'),
      ) as IBrowserViewMetaData),
    };
    logger.debug(`handleNewWindow() ${newWindowContext.meta.forceNewWindow ? 'forceNewWindow' : 'disposition'}`, {
      browserViewMetaData,
      disposition,
      nextUrl,
      nextDomain,
    });
    newWindowContext.meta.forceNewWindow = false;
    const metadataConfig = {
      additionalArguments: [
        `${MetaDataChannel.browserViewMetaData}${WindowNames.newWindow}`,
        `${MetaDataChannel.browserViewMetaData}${encodeURIComponent(JSON.stringify(browserViewMetaData))}`,
      ],
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    };
    const windowWithBrowserViewState = windowStateKeeper({
      file: 'window-state-open-in-new-window.json',
      path: SETTINGS_FOLDER,
      defaultWidth: windowDimension[WindowNames.main].width,
      defaultHeight: windowDimension[WindowNames.main].height,
    });
    let newOptions: BrowserWindowConstructorOptions = {
      x: windowWithBrowserViewState.x,
      y: windowWithBrowserViewState.y,
      width: windowWithBrowserViewState.width,
      height: windowWithBrowserViewState.height,
      webPreferences: metadataConfig,
      autoHideMenuBar: true,
    };

    if (isExternalLinkUsingJS) {
      newOptions = { ...newOptions, show: false };
    }
    parentWebContents.once('did-create-window', (childWindow) => {
      childWindow.setMenuBarVisibility(false);
      childWindow.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => handleNewWindow(details.url, newWindowContext, details.disposition, parentWebContents));
      childWindow.webContents.once('will-navigate', async (_event, url) => {
        // if the window is used for the current app, then use default behavior
        let appUrl = (await workspaceService.get(workspace.id))?.homeUrl;
        if (appUrl === undefined) {
          throw new Error(`Workspace ${workspace.id} not existed, or don't have homeUrl setting`);
        }
        appUrl = await getLocalHostUrlWithActualIP(appUrl);
        if (isInternalUrl(url, [appUrl, currentUrl])) {
          childWindow.show();
        } else {
          // if not, open in browser
          _event.preventDefault();
          void shell.openExternal(url);
          childWindow.close();
        }
      });
      windowWithBrowserViewState.manage(childWindow);
      const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
      void menuService.initContextMenuForWindowWebContents(view.webContents).then((unregisterContextMenu) => {
        childWindow.webContents.on('destroyed', () => {
          unregisterContextMenu();
        });
      });
    });
    return {
      action: 'allow',
      overrideBrowserWindowOptions: newOptions,
    };
  }

  return { action: 'allow' };
}
