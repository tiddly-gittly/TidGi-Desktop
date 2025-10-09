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
      void shell.openPath(absoluteFilePath).catch((_error: unknown) => {
        const error = _error instanceof Error ? _error : new Error(String(_error));
        const message = i18n.t('Log.FailedToOpenDirectory', { path: absoluteFilePath, message: error.message });
        logger.warn(message, { function: 'handleOpenFileExternalLink' });
        void wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, newWindowContext.workspace.id, [message]);
      });
    } else if (fileStat.isFile()) {
      logger.info(`Opening file ${absoluteFilePath}`, { function: 'handleOpenFileExternalLink' });
      void shell.openPath(absoluteFilePath).catch((_error: unknown) => {
        const error = _error instanceof Error ? _error : new Error(String(_error));
        const message = i18n.t('Log.FailedToOpenFile', { path: absoluteFilePath, message: error.message });
        logger.warn(message, { function: 'handleOpenFileExternalLink' });
        void wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, newWindowContext.workspace.id, [message]);
      });
    }
  } catch (_error: unknown) {
    const error = _error instanceof Error ? _error : new Error(String(_error));
    const message = `${i18n.t('AddWorkspace.PathNotExist', { path: absoluteFilePath })} ${error.message}`;
    logger.warn(message, { function: 'handleOpenFileExternalLink' });
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
  const absolutePath: string | undefined = nativeService.formatFileUrlToAbsolutePath(details.url);
  // When details.url is an absolute route, we just load it, don't need any redirect
  if (
    `file://${absolutePath}` === decodeURI(details.url) ||
    absolutePath === decodeURI(details.url) ||
    // also allow malformed `file:///` on `details.url` on windows, prevent infinite redirect when this check failed.
    (process.platform === 'win32' && `file:///${absolutePath}` === decodeURI(details.url))
  ) {
    logger.debug('open file protocol', {
      function: 'handleFileLink',
      absolutePath: String(absolutePath),
    });
    callback({
      cancel: false,
    });
  } else {
    logger.info('redirecting file protocol', {
      function: 'handleFileLink',
      absolutePath: String(absolutePath),
    });
    callback({
      cancel: false,
      redirectURL: `file://${absolutePath}`,
    });
  }
}
