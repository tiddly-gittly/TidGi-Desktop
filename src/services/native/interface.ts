import { MessageBoxOptions } from 'electron';
import { Observable } from 'rxjs';

import { NativeChannel } from '@/constants/channels';
import { IZxFileInput } from '@services/wiki/wikiWorker';
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
  mkdir(absoulutePath: string): Promise<void>;
  open(uri: string, isDirectory?: boolean): Promise<void>;
  openInEditor(filePath: string, editorName?: string | undefined): Promise<boolean>;
  openInGitGuiApp(filePath: string, editorName?: string | undefined): Promise<boolean>;
  openNewGitHubIssue(error: Error): Promise<void>;
  openPath(filePath: string): Promise<void>;
  path(method: 'basename' | 'dirname' | 'join', pathString: string | undefined, ...paths: string[]): Promise<string | undefined>;
  pickDirectory(defaultPath?: string, options?: IPickDirectoryOptions): Promise<string[]>;
  pickFile(filters?: Electron.OpenDialogOptions['filters']): Promise<string[]>;
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
    copyPath: ProxyPropertyType.Function,
    executeZxScript$: ProxyPropertyType.Function$,
    getLocalHostUrlWithActualInfo: ProxyPropertyType.Function,
    log: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    mkdir: ProxyPropertyType.Function,
    openInEditor: ProxyPropertyType.Function,
    openInGitGuiApp: ProxyPropertyType.Function,
    openNewGitHubIssue: ProxyPropertyType.Function,
    openPath: ProxyPropertyType.Function,
    path: ProxyPropertyType.Function,
    pickDirectory: ProxyPropertyType.Function,
    pickFile: ProxyPropertyType.Function,
    quit: ProxyPropertyType.Function,
    showElectronMessageBox: ProxyPropertyType.Function,
  },
};
