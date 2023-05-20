import { MessageBoxOptions } from 'electron';
import { Observable } from 'rxjs';

import { NativeChannel } from '@/constants/channels';
import { IZxFileInput } from '@services/wiki/wikiWorker';
import { WindowNames } from '@services/windows/WindowProperties';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface INativeService {
  /**
   * Execute zx script in a wiki worker and get result.
   * @param zxWorkerArguments
   * @param wikiFolderLocation Each wiki has its own worker, we use wiki's folder path to determine which worker to use. If not provided, will use current active workspace's wiki's path
   */
  executeZxScript$(zxWorkerArguments: IZxFileInput, wikiFolderLocation?: string): Observable<string>;
  getLocalHostUrlWithActualIP(url: string): Promise<string>;
  /**
   * Handles in-app assets loading.
   *
   * For in-wiki file:// links, see handleNewWindow() in `src/services/view/setupViewEventHandlers.ts`.
   */
  handleFileProtocol(): boolean;
  log(level: string, message: string, meta?: Record<string, unknown>): Promise<void>;
  open(uri: string, isDirectory?: boolean): Promise<void>;
  openInEditor(filePath: string, editorName?: string | undefined): Promise<boolean>;
  openInGitGuiApp(filePath: string, editorName?: string | undefined): Promise<boolean>;
  openNewGitHubIssue(error: Error): Promise<void>;
  openPath(filePath: string): Promise<void>;
  path(method: 'basename' | 'dirname' | 'join', pathString: string | undefined, ...paths: string[]): Promise<string | undefined>;
  pickDirectory(defaultPath?: string): Promise<string[]>;
  pickFile(filters?: Electron.OpenDialogOptions['filters']): Promise<string[]>;
  quit(): void;
  showElectronMessageBox(message: string, type: MessageBoxOptions['type'], WindowName?: WindowNames): Promise<void>;
}
export const NativeServiceIPCDescriptor = {
  channel: NativeChannel.name,
  properties: {
    executeZxScript$: ProxyPropertyType.Function$,
    getLocalHostUrlWithActualIP: ProxyPropertyType.Function,
    log: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    openInEditor: ProxyPropertyType.Function,
    openInGitGuiApp: ProxyPropertyType.Function,
    openNewGitHubIssue: ProxyPropertyType.Function,
    openPath: ProxyPropertyType.Function,
    pickDirectory: ProxyPropertyType.Function,
    pickFile: ProxyPropertyType.Function,
    quit: ProxyPropertyType.Function,
    path: ProxyPropertyType.Function,
    showElectronMessageBox: ProxyPropertyType.Function,
  },
};
