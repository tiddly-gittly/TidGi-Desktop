import { whenCommonInitFinished } from '@/helpers/mainInitFinished';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { BrowserView, shell } from 'electron';
import fs from 'fs-extra';
import { INewWindowAction } from './interface';

/**
 * Handles in-wiki file link opening.
 * This does not handle web request with file:// protocol.
 *
 * `file://` may resulted in `nextDomain` being `about:blank#blocked`, so we use `open://` instead. But in MacOS it seem to works fine in most cases. Just leave open:// in case as a fallback for users.
 *
 * For  file:/// in-app assets loading., see handleFileProtocol() in `src/services/native/index.ts`.
 */
export function handleOpenFileExternalLink(nextUrl: string): INewWindowAction | undefined {
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
  const absoluteFilePath = nativeService.formatFileUrlToAbsolutePath(nextUrl);
  const fileStat = fs.statSync(absoluteFilePath);
  if (fileStat.isDirectory()) {
    logger.info(`Opening directory ${absoluteFilePath}`, { function: 'handleOpenFileExternalLink' });
    void shell.openPath(absoluteFilePath);
  } else if (fileStat.isFile()) {
    logger.info(`Opening file ${absoluteFilePath}`, { function: 'handleOpenFileExternalLink' });
    void shell.openPath(absoluteFilePath);
    // void shell.openExternal(absoluteFilePath);
  }
  return {
    action: 'deny',
  };
}

/* eslint-disable n/no-callback-literal */
/**
 * Handle file protocol in webview to request file content and show in the view.
 */
export function handleViewFileContentLoading(view: BrowserView) {
  /**
   * This function is called after `await app.whenReady()`, but electron will still throw error `Failed to register protocol: filefix` in https://github.com/tiddly-gittly/TidGi-Desktop/issues/422 , so we further delay it.
   */
  void whenCommonInitFinished().then(() => {
    /**
     * Electron's bug, file protocol is not handle-able, won't get any callback. But things like `filea://` `filefix` works.
     */
    view.webContents.session.protocol.handle('filefix', async (request) => {
      let { pathname } = new URL(request.url);
      pathname = decodeURIComponent(pathname);
      logger.info(`Loading file content from ${pathname}`, { function: 'handleViewFileContentLoading view.webContents.session.protocol.handle' });
      try {
        const file = await fs.readFile(pathname);
        return new Response(file, { status: 200 });
      } catch (error) {
        return new Response(undefined, { status: 404, statusText: (error as Error).message });
      }
    });
  });
  view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('file://') || details.url.startsWith('open://')) {
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
  let redirectURL = nativeService.formatFileUrlToAbsolutePath(details.url);
  if (redirectURL === details.url) {
    // prevent redirect loop, remove file:// prefix, so it never comes back to this function from `handleViewFileContentLoading` again.
    redirectURL = redirectURL.replace('file://', '').replace('open://', '');
  } else {
    redirectURL = `filefix://${redirectURL}`;
  }
  logger.info(`Redirecting file protocol to ${redirectURL}`, { function: 'handleFileLink' });
  callback({
    cancel: false,
    redirectURL,
  });
}
