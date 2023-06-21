import { container } from '@services/container';
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
  const fileExists = fs.existsSync(absoluteFilePath);
  if (fileExists) {
    void shell.openPath(absoluteFilePath);
    return {
      action: 'deny',
    };
  }
}

/* eslint-disable n/no-callback-literal */
/**
 * Handle file protocol in webview to request file content and show in the view.
 */
export function handleViewFileContentLoading(view: BrowserView) {
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
  view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('file://') || details.url.startsWith('open://')) {
      handleFileLink(details, nativeService, callback);
    } else {
      callback({
        cancel: false,
      });
    }
  });
}

function handleFileLink(details: Electron.OnBeforeRequestListenerDetails, nativeService: INativeService, callback: (response: Electron.CallbackResponse) => void) {
  const redirectURL = nativeService.formatFileUrlToAbsolutePath(decodeURI(details.url));
  // DEBUG: console redirectURL
  console.log(`redirectURL`, redirectURL);
  if (redirectURL === details.url) {
    callback({
      cancel: false,
    });
  } else {
    callback({
      cancel: false,
      redirectURL,
    });
  }
}
