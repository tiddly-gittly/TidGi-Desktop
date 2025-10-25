import { MessageBoxOptions } from 'electron';
import { Observable } from 'rxjs';

import { NativeChannel } from '@/constants/channels';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IZxFileInput } from '@services/wiki/wikiWorker';
import { WindowNames } from '@services/windows/WindowProperties';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

export interface IPickDirectoryOptions {
  /**
   * Only works in MacOS, will use openDirectory as default on other platforms
   * @url https://github.com/electron/electron/issues/26885
   */
  allowOpenFile?: boolean;
  filters?: Electron.OpenDialogOptions['filters'];
}
/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface INativeService {
  /**
   * Initialize the native service
   * This should be called during app startup
   */
  initialize(): Promise<void>;
  /**
   * Register a keyboard shortcut and save it to preferences
   * @param serviceName The service identifier name from serviceIdentifier
   * @param methodName The method name to call when shortcut is triggered
   * @param shortcut The keyboard shortcut string, e.g. "Ctrl+Shift+T"
   * @template T The service interface type that contains the method, e.g. IWindowService
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  registerKeyboardShortcut<T>(serviceName: keyof typeof serviceIdentifier, methodName: keyof T, shortcut: string): Promise<void>;
  /**
   * Unregister a specific keyboard shortcut
   * @param serviceName The service identifier name from serviceIdentifier
   * @param methodName The method name
   * @template T The service interface type that contains the method, e.g. IWindowService
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  unregisterKeyboardShortcut<T>(serviceName: keyof typeof serviceIdentifier, methodName: keyof T): Promise<void>;
  /**
   * Get all registered keyboard shortcuts from preferences, key is combination of service name and method name joined by '.'
   * @returns A record where keys are formatted as 'serviceName.methodName' and values are the shortcut strings
   */
  getKeyboardShortcuts(): Promise<Record<string, string>>;
  /**
   * Execute a keyboard shortcut callback by key
   * This method wraps the backend getShortcutCallback logic for frontend use
   * @param key The key in format "ServiceIdentifier.methodName"
   */
  executeShortcutCallback(key: string): Promise<void>;
  /**
   * Copy a file or directory. The directory can have contents.
   * @param fromFilePath Note that if src is a directory it will copy everything inside of this directory, not the entire directory itself (see fs.extra issue #537).
   * @param toFilePath Note that if src is a file, dest cannot be a directory (see fs.extra issue #323). (but you can set `options.fileToDir` to true)
   * @param options.fileToDir true means dest is a directory, create if not exist
   * @returns false if failed. If success, returns the absolute path of the copied file or directory.
   */
  copyPath(fromFilePath: string, toFilePath: string, options?: { fileToDir?: boolean }): Promise<false | string>;
  /**
   * Execute zx script in a wiki worker and get result.
   * @param zxWorkerArguments
   * @param workspaceID Each wiki has its own worker, we use wiki's workspaceID to determine which worker to use. If not provided, will use current active workspace's ID
   */
  executeZxScript$(zxWorkerArguments: IZxFileInput, workspaceID?: string): Observable<string>;
  /**
   * Handles in-app assets loading. This should be called after `app.whenReady()` is resolved.
   * This handles file:// protocol when webview load image content, not handling file external link clicking.
   */
  formatFileUrlToAbsolutePath(urlWithFileProtocol: string): string;
  /**
   * Replace 0.0.0.0 to actual IP address.
   * @param urlToReplace Usually `getDefaultHTTPServerIP(port)`
   */
  getLocalHostUrlWithActualInfo(urlToReplace: string, workspaceID: string): Promise<string>;
  log(level: string, message: string, meta?: Record<string, unknown>): Promise<void>;
  /**
   * Log a message for a specific label (e.g., wiki name)
   * Each label gets its own log file in the wikis subdirectory
   * @param label The label for the log (e.g., wiki workspace name)
   * @param level Log level (error, warn, info, debug)
   * @param message Log message
   * @param meta Optional metadata
   */
  logFor(label: string, level: string, message: string, meta?: Record<string, unknown>): Promise<void>;
  mkdir(absoulutePath: string): Promise<void>;
  /**
   * Move a file or directory. The directory can have contents.
   * @param fromFilePath Note that if src is a directory it will copy everything inside of this directory, not the entire directory itself (see fs.extra issue #537).
   * @param toFilePath Note that if src is a file, dest cannot be a directory (see fs.extra issue #323). (but you can set `options.fileToDir` to true)
   * @param options.fileToDir true means dest is a directory, create if not exist
   * @returns false if failed. If success, returns the absolute path of the copied file or directory.
   */
  movePath(fromFilePath: string, toFilePath: string, options?: { fileToDir?: boolean }): Promise<false | string>;
  openInEditor(filePath: string, editorName?: string): Promise<boolean>;
  openInGitGuiApp(filePath: string, editorName?: string): Promise<boolean>;
  openNewGitHubIssue(error: Error): Promise<void>;
  /**
   * Open a file path, if is a relative path from wiki folder in the wiki folder, it will open it too.
   * @param filePath relative path from wiki folder, or an absolute path.
   * @param showItemInFolder Show the given file in a file manager. If possible, select the file.
   */
  openPath(filePath: string, showItemInFolder?: boolean): Promise<void>;
  /**
   * Open a file or URI in the desktop's default manner, or show in file manager.
   * @param uri File path or URI starts with any scheme.
   * @param showItemInFolder Show the given file in a file manager. If possible, select the file.
   */
  openURI(uri: string, showItemInFolder?: boolean): Promise<void>;
  path(method: 'basename' | 'dirname' | 'join', pathString: string | undefined, ...paths: string[]): Promise<string | undefined>;
  pickDirectory(defaultPath?: string, options?: IPickDirectoryOptions): Promise<string[]>;
  pickFile(filters?: Electron.OpenDialogOptions['filters']): Promise<string[]>;
  /**
   * Move a file or directory to the trash bin.
   * @param filePath The absolute path of the file or directory to move to the trash.
   * @returns A promise that resolves to true if the operation was successful, false otherwise.
   */
  moveToTrash(filePath: string): Promise<boolean>;
  quit(): void;
  showElectronMessageBox(options: Electron.MessageBoxOptions, windowName?: WindowNames): Promise<Electron.MessageBoxReturnValue | undefined>;
  /**
   * Shows a message box, it will block the process until the message box is closed. It returns the index of the clicked button.
   *
   * This can't be used in renderer process directly, because electron-ipc-cat doesn't support sync call. But you can use `window.remote.showElectronMessageBoxSync()` in renderer process, injected by preload script.
   *
   * The browserWindow argument allows the dialog to attach itself to a parent window, making it modal. If browserWindow is not shown dialog will not be attached to it. In such case it will be displayed as an independent window.
   * @returns the index of the clicked button.
   */
  showElectronMessageBoxSync(options: Electron.MessageBoxSyncOptions, windowName?: WindowNames): number | undefined;
}
export const NativeServiceIPCDescriptor = {
  channel: NativeChannel.name,
  properties: {
    initialize: ProxyPropertyType.Function,
    initializeKeyboardShortcuts: ProxyPropertyType.Function,
    registerKeyboardShortcut: ProxyPropertyType.Function,
    unregisterKeyboardShortcut: ProxyPropertyType.Function,
    getKeyboardShortcuts: ProxyPropertyType.Function,
    executeShortcutCallback: ProxyPropertyType.Function,
    copyPath: ProxyPropertyType.Function,
    executeZxScript$: ProxyPropertyType.Function$,
    formatFileUrlToAbsolutePath: ProxyPropertyType.Function,
    getLocalHostUrlWithActualInfo: ProxyPropertyType.Function,
    log: ProxyPropertyType.Function,
    logFor: ProxyPropertyType.Function,
    mkdir: ProxyPropertyType.Function,
    movePath: ProxyPropertyType.Function,
    moveToTrash: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    openInEditor: ProxyPropertyType.Function,
    openInGitGuiApp: ProxyPropertyType.Function,
    openNewGitHubIssue: ProxyPropertyType.Function,
    openPath: ProxyPropertyType.Function,
    openURI: ProxyPropertyType.Function,
    path: ProxyPropertyType.Function,
    pickDirectory: ProxyPropertyType.Function,
    pickFile: ProxyPropertyType.Function,
    quit: ProxyPropertyType.Function,
    showElectronMessageBox: ProxyPropertyType.Function,
  },
};
