/* eslint-disable @typescript-eslint/require-await */
import { app, dialog, ipcMain, MessageBoxOptions, shell } from 'electron';
import fs from 'fs-extra';
import { inject, injectable } from 'inversify';
import path from 'path';
import { Observable } from 'rxjs';

import { NativeChannel } from '@/constants/channels';
import { ZX_FOLDER } from '@/constants/paths';
import { lazyInject } from '@services/container';
import { ILogLevels, logger } from '@services/libs/log';
import { getLocalHostUrlWithActualIP, getUrlWithCorrectProtocol, replaceUrlPortWithSettingPort } from '@services/libs/url';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService, ZxWorkerControlActions } from '@services/wiki/interface';
import { IZxFileInput } from '@services/wiki/wikiWorker';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkspaceService } from '@services/workspaces/interface';
import i18next from 'i18next';
import { ZxNotInitializedError } from './error';
import { findEditorOrDefault, findGitGUIAppOrDefault, launchExternalEditor } from './externalApp';
import { INativeService, IPickDirectoryOptions } from './interface';
import { reportErrorToGithubWithTemplates } from './reportError';
import { githubDesktopUrl } from '@/constants/urls';

@injectable()
export class NativeService implements INativeService {
  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  constructor(@inject(serviceIdentifier.Window) private readonly windowService: IWindowService) {
    this.setupIpcHandlers();
  }

  setupIpcHandlers(): void {
    ipcMain.on(NativeChannel.showElectronMessageBoxSync, (event, options: MessageBoxOptions, windowName: WindowNames = WindowNames.main) => {
      event.returnValue = this.showElectronMessageBoxSync(options, windowName);
    });
  }

  public async openInEditor(filePath: string, editorName?: string): Promise<boolean> {
    // TODO: open vscode by default to speed up, support choose favorite editor later
    let defaultEditor = await findEditorOrDefault('Visual Studio Code').catch(() => {});
    if (defaultEditor === undefined) {
      defaultEditor = await findEditorOrDefault(editorName);
    }
    if (defaultEditor !== undefined) {
      await launchExternalEditor(filePath, defaultEditor);
      return true;
    }
    return false;
  }

  public async openInGitGuiApp(filePath: string, editorName?: string): Promise<boolean> {
    const defaultGitGui = await findGitGUIAppOrDefault(editorName);
    if (defaultGitGui !== undefined) {
      await launchExternalEditor(filePath, defaultGitGui);
      return true;
    }
    await shell.openExternal(githubDesktopUrl);
    return false;
  }

  public async openPath(filePath: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!filePath.trim()) {
      return;
    }
    logger.debug(`NativeService.openPath() Opening ${filePath}`);
    // TODO: add a switch that tell user these are dangerous features, use at own risk.
    if (path.isAbsolute(filePath)) {
      await shell.openPath(filePath);
    } else {
      const activeWorkspace = this.workspaceService.getActiveWorkspaceSync();
      if (activeWorkspace?.wikiFolderLocation !== undefined) {
        const absolutePath = path.resolve(path.join(activeWorkspace.wikiFolderLocation, filePath));
        await shell.openPath(absolutePath);
      }
    }
  }

  public async copyPath(fromFilePath: string, toFilePath: string, options?: { fileToDir?: boolean }): Promise<false | string> {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!fromFilePath.trim() || !toFilePath.trim()) {
      logger.error('NativeService.copyPath() fromFilePath or toFilePath is empty', { fromFilePath, toFilePath });
      return false;
    }
    if (!(await fs.exists(fromFilePath))) {
      logger.error('NativeService.copyPath() fromFilePath not exists', { fromFilePath, toFilePath });
      return false;
    }
    logger.debug(`NativeService.openPath() copy from ${fromFilePath} to ${toFilePath}`, options);
    if (options?.fileToDir === true) {
      await fs.ensureDir(toFilePath);
      const fileName = path.basename(fromFilePath);
      const copiedResultPath = path.join(toFilePath, fileName);
      await fs.copy(fromFilePath, copiedResultPath);
      return copiedResultPath;
    }
    await fs.copy(fromFilePath, toFilePath);
    return toFilePath;
  }

  public executeZxScript$(zxWorkerArguments: IZxFileInput, workspaceID?: string): Observable<string> {
    const zxWorker = this.wikiService.getWorker(workspaceID ?? this.workspaceService.getActiveWorkspaceSync()?.id ?? '');
    if (zxWorker === undefined) {
      const error = new ZxNotInitializedError();
      return new Observable<string>((observer) => {
        logger.error(error.message, zxWorkerArguments);
        observer.next(`${error.message}\n`);
      });
    }
    logger.info('zxWorker execute', { zxWorkerArguments, ZX_FOLDER });
    const observable = zxWorker.executeZxScript(zxWorkerArguments, ZX_FOLDER);
    return new Observable((observer) => {
      observable.subscribe((message) => {
        switch (message.type) {
          case 'control': {
            switch (message.actions) {
              case ZxWorkerControlActions.start: {
                if (message.message !== undefined) {
                  observer.next(message.message);
                  logger.debug(`zxWorker execute start with message`, { message: message.message });
                }
                break;
              }
              case ZxWorkerControlActions.error: {
                const errorMessage = message.message ?? 'get ZxWorkerControlActions.error without message';
                logger.error(`zxWorker execute failed with error ${errorMessage}`, { message });
                observer.next(errorMessage);
                break;
              }
              case ZxWorkerControlActions.ended: {
                const endedMessage = message.message ?? 'get ZxWorkerControlActions.ended without message';
                logger.info(`zxWorker execute ended with message`, { message: endedMessage });
                break;
              }
            }

            break;
          }
          case 'stderr':
          case 'stdout': {
            observer.next(message.message);
            logger.debug(`zxWorker execute has stdout/stderr`, { message: message.message });
            break;
          }
          case 'execution': {
            observer.next(`${i18next.t('Scripting.ExecutingScript')}

\`\`\`js
${message.message}
\`\`\`

`);

            break;
          }
            // No default
        }
      });
    });
  }

  public async showElectronMessageBox(options: Electron.MessageBoxOptions, windowName: WindowNames = WindowNames.main): Promise<Electron.MessageBoxReturnValue | undefined> {
    const window = this.windowService.get(windowName);
    if (window !== undefined) {
      return await dialog.showMessageBox(window, options);
    }
  }

  public showElectronMessageBoxSync(options: Electron.MessageBoxSyncOptions, windowName: WindowNames = WindowNames.main): number | undefined {
    const window = this.windowService.get(windowName);
    if (window !== undefined) {
      return dialog.showMessageBoxSync(window, options);
    }
  }

  public async pickDirectory(defaultPath?: string, options?: IPickDirectoryOptions): Promise<string[]> {
    const dialogResult = await dialog.showOpenDialog({
      properties: options?.allowOpenFile === true ? ['openDirectory', 'openFile'] : ['openDirectory'],
      defaultPath,
      filters: options?.filters,
    });
    if (!dialogResult.canceled && dialogResult.filePaths.length > 0) {
      return dialogResult.filePaths;
    }
    if (dialogResult.canceled && defaultPath !== undefined) {
      return [defaultPath];
    }
    return [];
  }

  public async pickFile(filters?: Electron.OpenDialogOptions['filters']): Promise<string[]> {
    const dialogResult = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters,
    });
    if (!dialogResult.canceled && dialogResult.filePaths.length > 0) {
      return dialogResult.filePaths;
    }
    return [];
  }

  public async open(uri: string, isDirectory = false): Promise<void> {
    isDirectory ? shell.showItemInFolder(uri) : await shell.openExternal(uri);
  }

  public async mkdir(absoulutePath: string): Promise<void> {
    await fs.mkdirp(absoulutePath);
  }

  public async quit(): Promise<void> {
    app.quit();
  }

  public async log(level: ILogLevels, message: string, meta?: Record<string, unknown>): Promise<void> {
    logger.log(level, message, meta);
  }

  public async openNewGitHubIssue(error: Error): Promise<void> {
    reportErrorToGithubWithTemplates(error);
  }

  public async getLocalHostUrlWithActualInfo(urlToReplace: string, workspaceID: string): Promise<string> {
    let replacedUrl = await getLocalHostUrlWithActualIP(urlToReplace);
    const workspace = await this.workspaceService.get(workspaceID);
    if (workspace !== undefined) {
      replacedUrl = replaceUrlPortWithSettingPort(replacedUrl, workspace.port);
      replacedUrl = getUrlWithCorrectProtocol(workspace, replacedUrl);
    }
    return replacedUrl;
  }

  public async path(method: 'basename' | 'dirname' | 'join', pathString: string | undefined, ...paths: string[]): Promise<string | undefined> {
    switch (method) {
      case 'basename': {
        if (typeof pathString === 'string') return path.basename(pathString);
        break;
      }
      case 'dirname': {
        if (typeof pathString === 'string') return path.dirname(pathString);
        break;
      }
      case 'join': {
        if (typeof pathString === 'string') return path.join(pathString, ...paths);
        break;
      }
      default: {
        break;
      }
    }
  }

  public formatFileUrlToAbsolutePath(urlWithFileProtocol: string): string {
    logger.info('getting url', { url: urlWithFileProtocol, function: 'formatFileUrlToAbsolutePath' });
    let pathname = '';
    let hostname = '';
    try {
      ({ hostname, pathname } = new URL(urlWithFileProtocol));
    } catch {
      pathname = urlWithFileProtocol.replace('file://', '').replace('open://', '');
      logger.error(`Parse URL failed, use original url replace file:// instead`, { pathname, function: 'formatFileUrlToAbsolutePath.error' });
    }
    /**
     * urlWithFileProtocol: `file://./files/xxx.png`
     * hostname: `.`, pathname: `/files/xxx.png`
     */
    let filePath = decodeURIComponent(`${hostname}${pathname}`);
    // get "/D:/" on windows
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }
    logger.info('handle file:// or open:// This url will open file in-wiki', { hostname, pathname, filePath, function: 'formatFileUrlToAbsolutePath' });
    let fileExists = fs.existsSync(filePath);
    logger.info(`This file (decodeURI) ${fileExists ? '' : 'not '}exists`, { filePath, function: 'formatFileUrlToAbsolutePath' });
    if (fileExists) {
      return filePath;
    }
    logger.info(`try find file relative to workspace folder`, { filePath, function: 'formatFileUrlToAbsolutePath' });
    const workspace = this.workspaceService.getActiveWorkspaceSync();
    if (workspace === undefined) {
      logger.error(`No active workspace, abort. Try loading filePath as-is.`, { filePath, function: 'formatFileUrlToAbsolutePath' });
      return filePath;
    }
    // try concat workspace path + file path to get relative path
    const filePathInWorkspaceFolder = path.resolve(workspace.wikiFolderLocation, filePath);
    fileExists = fs.existsSync(filePathInWorkspaceFolder);
    logger.info(`This file ${fileExists ? '' : 'not '}exists in workspace folder.`, { filePathInWorkspaceFolder, function: 'formatFileUrlToAbsolutePath' });
    if (fileExists) {
      return filePathInWorkspaceFolder;
    }
    // on production, __dirname will be in .webpack/main
    const inTidGiAppAbsoluteFilePath = path.join(app.getAppPath(), '.webpack', 'renderer', filePath);
    logger.info(`try find file relative to TidGi App folder`, { inTidGiAppAbsoluteFilePath, function: 'formatFileUrlToAbsolutePath' });
    fileExists = fs.existsSync(inTidGiAppAbsoluteFilePath);
    if (fileExists) {
      return inTidGiAppAbsoluteFilePath;
    }
    logger.warn(`This url can't be loaded in-wiki. Try loading url as-is.`, { url: urlWithFileProtocol, function: 'formatFileUrlToAbsolutePath' });
    return urlWithFileProtocol;
  }
}
