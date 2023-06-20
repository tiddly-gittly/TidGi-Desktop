import { container } from '@services/container';
import { logger } from '@services/libs/log';
import { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspaceService } from '@services/workspaces/interface';
import { BrowserView, shell } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { INewWindowAction } from './interface';

/**
 * Handles in-wiki file link opening.
 * This does not handle web request with file:// protocol.
 *
 * `file://` may resulted in `nextDomain` being `about:blank#blocked`, so we use `open://` instead. But in MacOS it seem to works fine in most cases. Just leave open:// in case as a fallback for users.
 *
 * For  file:/// in-app assets loading., see handleFileProtocol() in `src/services/native/index.ts`.
 */
export function handleOpenFileExternalLink(
  nextUrl: string,
  nextDomain: string | undefined,
  disposition: 'default' | 'new-window' | 'foreground-tab' | 'background-tab' | 'save-to-disk' | 'other',
): INewWindowAction | undefined {
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);

  if (nextUrl.startsWith('open://') || nextUrl.startsWith('file://')) {
    let { pathname } = new URL(nextUrl);
    if (process.platform === 'win32') {
      // fix `/G:/EpicGames` to `G:/EpicGames` on windows
      pathname = pathname.slice(1);
    }
    logger.debug('handle file:// or open:// This url will open file externally', { pathname, nextUrl, nextDomain, disposition, function: 'handleOpenFileExternalLink' });
    const filePath = path.resolve(pathname);
    const fileExists = fs.existsSync(filePath);
    logger.debug(`This file (decodeURI) ${fileExists ? '' : 'not '}exists`, { filePath, function: 'handleOpenFileExternalLink' });
    if (fileExists) {
      void shell.openPath(filePath);
      return {
        action: 'deny',
      };
    }
    logger.debug(`try find file relative to workspace folder`);
    void workspaceService.getActiveWorkspace().then((workspace) => {
      if (workspace !== undefined) {
        const filePathInWorkspaceFolder = path.resolve(workspace.wikiFolderLocation, filePath);
        const fileExistsInWorkspaceFolder = fs.existsSync(filePathInWorkspaceFolder);
        logger.debug(`This file ${fileExistsInWorkspaceFolder ? '' : 'not '}exists in workspace folder.`, { filePathInWorkspaceFolder });
        if (fileExistsInWorkspaceFolder) {
          void shell.openPath(filePathInWorkspaceFolder);
        }
      }
    });
    return {
      action: 'deny',
    };
  }
}

/* eslint-disable n/no-callback-literal */
/**
 * Handle file protocol in webview to request file content and show in the view.
 */
export function handleViewFileContentLoading(view: BrowserView, nativeService: INativeService) {
  view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    // DEBUG: console details
    console.log(`details`, details);
    if (details.url.startsWith('file://') || details.url.startsWith('open://')) {
      void handleFileLink(details, nativeService, callback);
    } else {
      callback({
        cancel: false,
      });
    }
  });
}

async function handleFileLink(details: Electron.OnBeforeRequestListenerDetails, nativeService: INativeService, callback: (response: Electron.CallbackResponse) => void) {
  await nativeService.formatFileUrlToAbsolutePath({ url: details.url }, (redirectURL: string) => {
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
  });
}
