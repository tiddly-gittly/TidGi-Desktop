import { app, BrowserWindow, BrowserWindowConstructorOptions, nativeImage, shell, WebContentsView } from 'electron';
import fsExtra from 'fs-extra';
import { throttle } from 'lodash';
import path from 'path';

import { buildResourcePath } from '@/constants/paths';
import getViewBounds from '@services/libs/getViewBounds';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

import { ViewChannel, WindowChannel } from '@/constants/channels';
import { isWin } from '@/helpers/system';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { isSameOrigin } from '@services/libs/url';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { ViewLoadUrlError } from './error';
import { handleNewWindow } from './handleNewWindow';
import { handleViewFileContentLoading } from './setupViewFileProtocol';

export interface IViewContext {
  loadInitialUrlWithCatch: () => Promise<void>;
  sharedWebPreferences: BrowserWindowConstructorOptions['webPreferences'];
  shouldPauseNotifications: boolean;
  windowName: WindowNames;
  workspace: IWorkspace;
}

export interface IViewMeta {
  forceNewWindow: boolean;
}

/**
 * Bind workspace related event handler to view.webContent
 */
export default function setupViewEventHandlers(
  view: WebContentsView,
  browserWindow: BrowserWindow,
  { workspace, sharedWebPreferences, loadInitialUrlWithCatch, windowName }: IViewContext,
): void {
  // metadata and state about current WebContentsView
  const viewMeta: IViewMeta = {
    forceNewWindow: false,
  };

  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  handleViewFileContentLoading(view);
  view.webContents.on('did-start-loading', async () => {
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and WebContentsView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active && (await workspaceService.workspaceDidFailLoad(workspace.id)) && browserWindow !== undefined && !browserWindow.isDestroyed()) {
      // fix https://github.com/webcatalog/singlebox-legacy/issues/228
      const contentSize = browserWindow.getContentSize();
      view.setBounds(await getViewBounds(contentSize as [number, number], { windowName }));
    }
    await workspaceService.updateMetaData(workspace.id, {
      didFailLoadErrorMessage: null,
      isLoading: true,
    });
  });
  view.webContents.on('will-navigate', async (event, newUrl) => {
    logger.debug('will-navigate called', {
      newUrl,
      function: 'will-navigate',
    });
    const currentUrl = view.webContents.getURL();
    if (isSameOrigin(newUrl, currentUrl)) {
      logger.debug('will-navigate skipped due to same origin', { newUrl, currentUrl, function: 'will-navigate' });
      return;
    }
    const isWiki = isWikiWorkspace(workspace);
    const homeUrl = isWiki ? workspace.homeUrl : '';
    const lastUrl = isWiki ? workspace.lastUrl : null;
    // skip handling if is in-wiki link
    if (
      isSameOrigin(newUrl, homeUrl) ||
      isSameOrigin(newUrl, lastUrl)
    ) {
      logger.debug('will-navigate skipped due to same origin (home/last)', { newUrl, homeUrl, lastUrl, function: 'will-navigate' });
      return;
    }
    // if is external website
    logger.debug('will-navigate openExternal', { newUrl, currentUrl, homeUrl, lastUrl });
    await shell.openExternal(newUrl).catch((error_: unknown) => {
      const error = error_ as Error;
      logger.error(`will-navigate openExternal error ${error.message}`, { error });
    });
    // if is an external website
    event.preventDefault();
    try {
      // TODO: do this until https://github.com/electron/electron/issues/31783 fixed
      await view.webContents.loadURL(currentUrl);
    } catch (error_: unknown) {
      const error = error_ as Error;
      logger.warn(new ViewLoadUrlError(lastUrl ?? '', `${error.message} ${error.stack ?? ''}`));
    }
    // event.stopPropagation();
  });
  const throttledDidFinishedLoad = throttle(async (reason: string) => {
    // if have error, don't realignActiveWorkspace, which will hide the error message
    if (await workspaceService.workspaceDidFailLoad(workspace.id)) {
      return;
    }
    if (view.webContents === null) {
      return;
    }
    logger.debug('set isLoading to false', {
      reason,
      id: workspace.id,
      function: 'throttledDidFinishedLoad',
    });
    // focus on initial load
    // https://github.com/atomery/webcatalog/issues/398
    if (workspace.active && !browserWindow.isDestroyed() && browserWindow.isFocused() && !view.webContents.isFocused()) {
      view.webContents.focus();
    }
    // update isLoading to false when load succeed
    await workspaceService.updateMetaData(workspace.id, {
      isLoading: false,
    });
  }, 2000);
  view.webContents.on('did-finish-load', () => {
    logger.debug('did-finish-load called');
    void throttledDidFinishedLoad('did-finish-load');
  });
  view.webContents.on('did-stop-loading', () => {
    logger.debug(`did-stop-loading called ${workspace.id}`);
    void throttledDidFinishedLoad('did-stop-loading');
  });
  view.webContents.on('dom-ready', () => {
    logger.debug('dom-ready called');
    void throttledDidFinishedLoad('dom-ready');
  });

  // https://electronjs.org/docs/api/web-contents#event-did-fail-load
  // https://github.com/webcatalog/neutron/blob/3d9e65c255792672c8bc6da025513a5404d98730/main-src/libs/views.js#L397
  view.webContents.on('did-fail-load', async (_event, errorCode, errorDesc, _validateUrl, isMainFrame) => {
    const [workspaceObject, workspaceDidFailLoad] = await Promise.all([
      workspaceService.get(workspace.id),
      workspaceService.workspaceDidFailLoad(workspace.id),
    ]);
    // this event might be triggered
    // even after the workspace obj and WebContentsView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceDidFailLoad) {
      return;
    }
    if (isMainFrame && errorCode < 0 && errorCode !== -3) {
      // Fix nodejs wiki start slow on system startup, which cause `-102 ERR_CONNECTION_REFUSED` even if wiki said it is booted, we have to retry several times
      if (errorCode === -102 && view.webContents.getURL().length > 0 && isWikiWorkspace(workspaceObject) && workspaceObject.homeUrl.startsWith('http')) {
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
        view.setBounds(await getViewBounds(contentSize as [number, number], { findInPage: false }, 0, 0)); // hide browserView to show error message
      }
    }
    // edge case to handle failed auth, use setTimeout to prevent infinite loop
    if (errorCode === -300 && view.webContents.getURL().length === 0 && isWikiWorkspace(workspaceObject) && workspaceObject.homeUrl.startsWith('http')) {
      setTimeout(async () => {
        await loadInitialUrlWithCatch();
      }, 1000);
    }
  });
  view.webContents.on('did-navigate', async (_event, url) => {
    logger.debug(`did-navigate called ${url}`);
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and WebContentsView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active) {
      await windowService.sendToAllWindows(WindowChannel.updateCanGoBack, view.webContents.navigationHistory.canGoBack());
      await windowService.sendToAllWindows(WindowChannel.updateCanGoForward, view.webContents.navigationHistory.canGoForward());
    }
  });
  view.webContents.on('did-navigate-in-page', async (_event, url) => {
    logger.debug(`did-navigate-in-page called ${url}`);
    await workspaceViewService.updateLastUrl(workspace.id, view);
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and WebContentsView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    if (workspaceObject.active) {
      await windowService.sendToAllWindows(WindowChannel.updateCanGoBack, view.webContents.navigationHistory.canGoBack());
      await windowService.sendToAllWindows(WindowChannel.updateCanGoForward, view.webContents.navigationHistory.canGoForward());
    }
  });
  view.webContents.on('page-title-updated', async (_event, title) => {
    const workspaceObject = await workspaceService.get(workspace.id);
    // this event might be triggered
    // even after the workspace obj and WebContentsView
    // are destroyed. See https://github.com/atomery/webcatalog/issues/836
    if (workspaceObject === undefined) {
      return;
    }
    // For main/tidgiMiniWindow, only update title if workspace is active
    // For secondary/other windows, always update title regardless of active status
    if (windowName === WindowNames.secondary || workspaceObject.active) {
      browserWindow.setTitle(title);
    }
  });

  view.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) =>
    handleNewWindow(
      details,
      {
        workspace,
        sharedWebPreferences,
        view,
        meta: viewMeta,
      },
      view.webContents,
    )
  );
  // Handle downloads
  // https://electronjs.org/docs/api/download-item
  view.webContents.session.on('will-download', (_event, item) => {
    const { askForDownloadPath, downloadPath } = preferenceService.getPreferences();
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

        const inc = Number.parseInt(incString, 10) || 0;
        await workspaceService.updateMetaData(workspace.id, {
          badgeCount: inc,
        });
        let count = 0;
        const workspaceMetaData = await workspaceService.getAllMetaData();
        Object.values(workspaceMetaData).forEach((metaData) => {
          if (typeof metaData.badgeCount === 'number') {
            count += metaData.badgeCount;
          }
        });
        app.badgeCount = count;
        if (isWin) {
          if (count > 0) {
            const icon = nativeImage.createFromPath(path.resolve(buildResourcePath, 'overlay-icon.png'));
            browserWindow.setOverlayIcon(icon, `You have ${count} new messages.`);
          } else {
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
    } catch (error_: unknown) {
      const error = error_ as Error;
      logger.warn(error);
    }
  });
}
