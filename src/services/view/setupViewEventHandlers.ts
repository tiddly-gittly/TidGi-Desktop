/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable unicorn/consistent-destructuring */
import { app, BrowserView, BrowserWindow, BrowserWindowConstructorOptions, nativeImage, shell } from 'electron';
import fsExtra from 'fs-extra';
import { throttle } from 'lodash';
import path from 'path';

import { buildResourcePath } from '@/constants/paths';
import getViewBounds from '@services/libs/getViewBounds';
import { IWorkspace } from '@services/workspaces/interface';

import { ViewChannel, WindowChannel } from '@/constants/channels';
import { isWin } from '@/helpers/system';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { isSameOrigin } from '@services/libs/url';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { handleNewWindow } from './handleNewWindow';
import { handleViewFileContentLoading } from './setupViewFileProtocol';
import { ViewLoadUrlError } from './error';

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

  handleViewFileContentLoading(view);
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
    // skip handling if is in-wiki link
    if (
      isSameOrigin(newUrl, homeUrl) ||
      isSameOrigin(newUrl, lastUrl)
    ) {
      return;
    }
    // if is external website
    logger.debug('will-navigate openExternal', { newUrl, currentUrl, homeUrl, lastUrl });
    await shell.openExternal(newUrl).catch((error) => logger.error(`will-navigate openExternal error ${(error as Error).message}`, error));
    // if is an external website
    event.preventDefault();
    try {
      // TODO: do this until https://github.com/electron/electron/issues/31783 fixed
      await view.webContents.loadURL(currentUrl);
    } catch (error) {
      logger.warn(new ViewLoadUrlError(lastUrl ?? '', `${(error as Error).message} ${(error as Error).stack ?? ''}`));
    }
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
