import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import { shell, WebContentsView } from 'electron';
import fs from 'fs-extra';
import type { INewWindowContext } from './handleNewWindow';
import type { INewWindowAction } from './interface';

/**
 * Handles in-wiki file link opening.
 * This does not handle web request with file:// protocol.
 *
 * `file://` may resulted in `nextDomain` being `about:blank#blocked`, so we use `open://` instead. But in MacOS it seem to works fine in most cases. Just leave open:// in case as a fallback for users.
 *
 * For  file:/// in-app assets loading., see handleFileProtocol() in `src/services/native/index.ts`.
 */
export function handleOpenFileExternalLink(nextUrl: string, newWindowContext: INewWindowContext): INewWindowAction | undefined {
  if (!nextUrl.startsWith('file://') && !nextUrl.startsWith('open://')) return;
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const absoluteFilePath = nativeService.formatFileUrlToAbsolutePath(nextUrl);
  try {
    const fileStat = fs.statSync(absoluteFilePath);
    if (fileStat.isDirectory()) {
      logger.info(`Opening directory ${absoluteFilePath}`, { function: 'handleOpenFileExternalLink' });
      void shell.openPath(absoluteFilePath).catch((error_: unknown) => {
        const error = error_ as Error;
        const message = i18n.t('Log.FailedToOpenDirectory', { path: absoluteFilePath, message: error.message });
        logger.warn(message, { function: 'handleOpenFileExternalLink', error });
        void wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, newWindowContext.workspace.id, [message]);
      });
    } else if (fileStat.isFile()) {
      logger.info(`Opening file ${absoluteFilePath}`, { function: 'handleOpenFileExternalLink' });
      void shell.openPath(absoluteFilePath).catch((error_: unknown) => {
        const error = error_ as Error;
        const message = i18n.t('Log.FailedToOpenFile', { path: absoluteFilePath, message: error.message });
        logger.warn(message, { function: 'handleOpenFileExternalLink', error });
        void wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, newWindowContext.workspace.id, [message]);
      });
    }
  } catch (error_: unknown) {
    const error = error_ as Error;
    const message = `${i18n.t('AddWorkspace.PathNotExist', { path: absoluteFilePath })} ${error.message}`;
    logger.warn(message, { function: 'handleOpenFileExternalLink', error });
    void wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, newWindowContext.workspace.id, [message]);
  }
  return {
    action: 'deny',
  };
}

/**
 * Handle file protocol in webview to request file content and show in the view.
 *
 * Similar to src/services/view/setupIpcServerRoutesHandlers.ts where it is redirect and handled by tiddlywiki server.
 */
export function handleViewFileContentLoading(view: WebContentsView) {
  view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('file://')) {
      handleFileLink(details, callback);
    } else {
      callback({
        cancel: false,
      });
    }
  });
}

function handleFileLink(details: Electron.OnBeforeRequestListenerDetails, callback: (response: Electron.CallbackResponse) => void) {
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
  const absolutePath: string = nativeService.formatFileUrlToAbsolutePath(details.url);

  // Prevent infinite redirect loop when path resolution failed
  // formatFileUrlToAbsolutePath already checks file existence internally (3 times with different path strategies)
  // If file not found, it returns the original URL as fallback
  // Case 1: formatFileUrlToAbsolutePath returns the original URL (file not found fallback)
  // Case 2: Resolved path still contains protocol (resolution failed)
  // Case 3: Resolved path is relative (./xxx or ../xxx) - these cannot be loaded by Electron
  if (
    absolutePath === details.url ||
    absolutePath.startsWith('file://') ||
    absolutePath.startsWith('open://') ||
    absolutePath.startsWith('./') ||
    absolutePath.startsWith('../')
  ) {
    logger.warn('File path resolution failed or returned invalid path, request canceled to prevent redirect loop', {
      function: 'handleFileLink',
      originalUrl: details.url,
      resolvedPath: absolutePath,
      reason: absolutePath === details.url
        ? 'same as original'
        : absolutePath.startsWith('file://') || absolutePath.startsWith('open://')
        ? 'contains protocol'
        : 'relative path',
    });
    callback({
      cancel: true,
    });
    return;
  }

  // When details.url is already an absolute file path, load it directly without redirect
  const decodedUrl = decodeURI(details.url);
  if (
    `file://${absolutePath}` === decodedUrl ||
    absolutePath === decodedUrl ||
    // also allow malformed `file:///` on `details.url` on windows
    (process.platform === 'win32' && `file:///${absolutePath}` === decodedUrl)
  ) {
    logger.debug('Loading file without redirect', {
      function: 'handleFileLink',
      absolutePath,
      originalUrl: details.url,
    });
    callback({
      cancel: false,
    });
  } else {
    // Need to redirect relative path to absolute path
    logger.info('Redirecting file protocol to absolute path', {
      function: 'handleFileLink',
      originalUrl: details.url,
      absolutePath,
      redirectURL: `file://${absolutePath}`,
    });
    callback({
      cancel: false,
      redirectURL: `file://${absolutePath}`,
    });
  }
}
