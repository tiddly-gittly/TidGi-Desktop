import { app, dialog, globalShortcut, ipcMain, MessageBoxOptions, shell } from 'electron';
import fs from 'fs-extra';
import { inject, injectable } from 'inversify';
import path from 'path';
import { Observable } from 'rxjs';

import { NativeChannel } from '@/constants/channels';
import { ZX_FOLDER } from '@/constants/paths';
import { githubDesktopUrl } from '@/constants/urls';
import { container } from '@services/container';
import { getLoggerForLabel, logger } from '@services/libs/log';
import { getLocalHostUrlWithActualIP, getUrlWithCorrectProtocol, replaceUrlPortWithSettingPort } from '@services/libs/url';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import { ZxWorkerControlActions } from '@services/wiki/interface';
import type { IZxFileInput } from '@services/wiki/wikiWorker';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import i18next from 'i18next';
import { ZxNotInitializedError } from './error';
import { findEditorOrDefault, findGitGUIAppOrDefault, launchExternalEditor } from './externalApp';
import type { INativeService, IPickDirectoryOptions } from './interface';
import { getShortcutCallback, registerShortcutByKey } from './keyboardShortcutHelpers';
import { reportErrorToGithubWithTemplates } from './reportError';

@injectable()
export class NativeService implements INativeService {
  constructor(
    @inject(serviceIdentifier.Window) private readonly windowService: IWindowService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    this.setupIpcHandlers();
  }

  public setupIpcHandlers(): void {
    ipcMain.on(NativeChannel.showElectronMessageBoxSync, (event, options: MessageBoxOptions, windowName: WindowNames = WindowNames.main) => {
      event.returnValue = this.showElectronMessageBoxSync(options, windowName);
    });
  }

  public async initialize(): Promise<void> {
    await this.initializeKeyboardShortcuts();
  }

  private async initializeKeyboardShortcuts(): Promise<void> {
    const shortcuts = await this.getKeyboardShortcuts();
    logger.debug('shortcuts from preferences', { shortcuts, function: 'initializeKeyboardShortcuts' });
    // Register all saved shortcuts
    for (const [key, shortcut] of Object.entries(shortcuts)) {
      if (shortcut && shortcut.trim() !== '') {
        try {
          await registerShortcutByKey(key, shortcut);
        } catch (error) {
          logger.error(`Failed to register shortcut ${key}: ${shortcut}`, { error });
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async registerKeyboardShortcut<T>(serviceName: keyof typeof serviceIdentifier, methodName: keyof T, shortcut: string): Promise<void> {
    try {
      const key = `${serviceName}.${String(methodName)}`;
      logger.info('Starting keyboard shortcut registration', { key, shortcut, serviceName, methodName, function: 'NativeService.registerKeyboardShortcut' });

      // Save to preferences
      const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
      const shortcuts = await this.getKeyboardShortcuts();
      logger.debug('Current shortcuts before registration', { shortcuts, function: 'NativeService.registerKeyboardShortcut' });

      shortcuts[key] = shortcut;
      await preferenceService.set('keyboardShortcuts', shortcuts);
      logger.info('Saved shortcut to preferences', { key, shortcut, function: 'NativeService.registerKeyboardShortcut' });

      // Register the shortcut
      await registerShortcutByKey(key, shortcut);
      logger.info('Successfully registered new keyboard shortcut', { key, shortcut, function: 'NativeService.registerKeyboardShortcut' });
    } catch (error) {
      logger.error('Failed to register keyboard shortcut', { error, serviceIdentifier: serviceName, methodName, shortcut, function: 'NativeService.registerKeyboardShortcut' });
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async unregisterKeyboardShortcut<T>(serviceName: keyof typeof serviceIdentifier, methodName: keyof T): Promise<void> {
    try {
      const key = `${serviceName}.${String(methodName)}`;

      // Get the current shortcut string before removing from preferences
      const shortcuts = await this.getKeyboardShortcuts();
      const shortcutString = shortcuts[key];

      // Remove from preferences
      const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete shortcuts[key];
      await preferenceService.set('keyboardShortcuts', shortcuts);

      // Unregister the shortcut using the actual shortcut string, not the key
      if (shortcutString && globalShortcut.isRegistered(shortcutString)) {
        globalShortcut.unregister(shortcutString);
        logger.info('Successfully unregistered keyboard shortcut', { key, shortcutString });
      } else {
        logger.warn('Shortcut was not registered or shortcut string not found', { key, shortcutString });
      }
    } catch (error) {
      logger.error('Failed to unregister keyboard shortcut', { error, serviceIdentifier: serviceName, methodName });
      throw error;
    }
  }

  public async getKeyboardShortcuts(): Promise<Record<string, string>> {
    const preferences = this.preferenceService.getPreferences();
    return preferences.keyboardShortcuts || {};
  }

  public async executeShortcutCallback(key: string): Promise<void> {
    logger.debug('Frontend requested shortcut execution', { key, function: 'NativeService.executeShortcutCallback' });

    const callback = getShortcutCallback(key);
    if (callback) {
      await callback();
      logger.info('Successfully executed shortcut callback from frontend', { key, function: 'NativeService.executeShortcutCallback' });
    } else {
      logger.warn('No callback found for shortcut key from frontend', { key, function: 'NativeService.executeShortcutCallback' });
    }
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

  public async openURI(uri: string, showItemInFolder = false): Promise<void> {
    logger.debug('open called', {
      function: 'open',
      uri,
      showItemInFolder,
    });
    if (showItemInFolder) {
      shell.showItemInFolder(uri);
    } else {
      await shell.openExternal(uri);
    }
  }

  public async openPath(filePath: string, showItemInFolder?: boolean): Promise<void> {
    if (!filePath.trim()) {
      return;
    }
    logger.debug('openPath called', {
      function: 'openPath',
      filePath,
    });
    // TODO: add a switch that tell user these are dangerous features, use at own risk.
    if (path.isAbsolute(filePath)) {
      if (showItemInFolder) {
        shell.showItemInFolder(filePath);
      } else {
        await shell.openPath(filePath);
      }
    } else {
      const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
      const activeWorkspace = workspaceService.getActiveWorkspaceSync();
      if (activeWorkspace && isWikiWorkspace(activeWorkspace) && activeWorkspace.wikiFolderLocation !== undefined) {
        const absolutePath = path.resolve(path.join(activeWorkspace.wikiFolderLocation, filePath));
        if (showItemInFolder) {
          shell.showItemInFolder(absolutePath);
        } else {
          await shell.openPath(absolutePath);
        }
      }
    }
  }

  public async copyPath(fromFilePath: string, toFilePath: string, options?: { fileToDir?: boolean }): Promise<false | string> {
    if (!fromFilePath.trim() || !toFilePath.trim()) {
      logger.error('fromFilePath or toFilePath is empty', { fromFilePath, toFilePath, function: 'copyPath' });
      return false;
    }
    if (!(await fs.exists(fromFilePath))) {
      logger.error('fromFilePath not exists', { fromFilePath, toFilePath, function: 'copyPath' });
      return false;
    }
    logger.debug('copyPath called', {
      function: 'copyPath',
      fromFilePath,
      toFilePath,
      options,
    });
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

  public async movePath(fromFilePath: string, toFilePath: string, options?: { fileToDir?: boolean }): Promise<false | string> {
    if (!fromFilePath.trim() || !toFilePath.trim()) {
      logger.error('fromFilePath or toFilePath is empty', { fromFilePath, toFilePath, function: 'movePath' });
      return false;
    }
    if (!(await fs.exists(fromFilePath))) {
      logger.error('fromFilePath not exists', { fromFilePath, toFilePath, function: 'movePath' });
      return false;
    }
    logger.debug('movePath called', {
      function: 'movePath',
      fromFilePath,
      toFilePath,
      options,
    });
    try {
      if (options?.fileToDir === true) {
        const folderPath = path.dirname(toFilePath);
        await fs.ensureDir(folderPath);
      }
      await fs.move(fromFilePath, toFilePath);
      return toFilePath;
    } catch (error) {
      logger.error('movePath failed', { error, function: 'movePath' });
      return false;
    }
  }

  public executeZxScript$(zxWorkerArguments: IZxFileInput, workspaceID?: string): Observable<string> {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const zxWorker = wikiService.getWorker(workspaceID ?? workspaceService.getActiveWorkspaceSync()?.id ?? '');
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

  public async mkdir(absoulutePath: string): Promise<void> {
    await fs.mkdirp(absoulutePath);
  }

  public async quit(): Promise<void> {
    app.quit();
  }

  public async log(level: string, message: string, meta?: Record<string, unknown>): Promise<void> {
    logger.log(level, message, meta);
  }

  public async openNewGitHubIssue(error: Error): Promise<void> {
    reportErrorToGithubWithTemplates(error);
  }

  public async getLocalHostUrlWithActualInfo(urlToReplace: string, workspaceID: string): Promise<string> {
    let replacedUrl = await getLocalHostUrlWithActualIP(urlToReplace);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.get(workspaceID);
    if (workspace !== undefined && isWikiWorkspace(workspace)) {
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

  public async moveToTrash(filePath: string): Promise<boolean> {
    if (!filePath?.trim?.()) {
      logger.error('filePath is empty', { filePath, function: 'moveToTrash' });
      return false;
    }
    logger.debug('moveToTrash called', {
      function: 'moveToTrash',
      filePath,
    });
    try {
      await shell.trashItem(filePath);
      return true;
    } catch {
      logger.debug('failed with original path, trying with decoded path', { function: 'moveToTrash' });
      try {
        const decodedPath = decodeURIComponent(filePath);
        logger.debug('moveToTrash retry with decoded path', {
          function: 'moveToTrash',
          decodedPath,
        });
        await shell.trashItem(decodedPath);
        return true;
      } catch (error) {
        logger.error('failed with decoded path', { error, filePath, function: 'moveToTrash' });
      }
      return false;
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
    // get "D:/" instead of "/D:/" on windows
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }
    logger.info('handle file:// or open:// This url will open file in-wiki', { hostname, pathname, filePath, function: 'formatFileUrlToAbsolutePath' });
    let fileExists = fs.existsSync(filePath);
    logger.info('file exists (decodeURI)', {
      function: 'formatFileUrlToAbsolutePath',
      filePath,
      exists: fileExists,
    });
    if (fileExists) {
      return filePath;
    }
    logger.info(`try find file relative to workspace folder`, { filePath, function: 'formatFileUrlToAbsolutePath' });
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = workspaceService.getActiveWorkspaceSync();
    if (workspace === undefined || !isWikiWorkspace(workspace)) {
      logger.error(`No active workspace or not a wiki workspace, abort. Try loading filePath as-is.`, { filePath, function: 'formatFileUrlToAbsolutePath' });
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

  public async logFor(label: string, level: 'error' | 'warn' | 'info' | 'debug', message: string, meta?: Record<string, unknown>): Promise<void> {
    const labeledLogger = getLoggerForLabel(label);
    labeledLogger.log(level, message, meta);
  }
}
