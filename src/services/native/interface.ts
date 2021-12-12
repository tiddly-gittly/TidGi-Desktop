import { MessageBoxOptions } from 'electron';
import { Observable } from 'rxjs';

import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { NativeChannel } from '@/constants/channels';
import { WindowNames } from '@services/windows/WindowProperties';
import { IZxFileInput } from './zxWorker';

/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface INativeService {
  executeZxScript$(zxWorkerArguments: IZxFileInput): Observable<string>;
  log(level: string, message: string, meta?: Record<string, unknown>): Promise<void>;
  open(uri: string, isDirectory?: boolean): Promise<void>;
  openInEditor(filePath: string, editorName?: string | undefined): Promise<void>;
  openInGitGuiApp(filePath: string, editorName?: string | undefined): Promise<void>;
  pickDirectory(defaultPath?: string): Promise<string[]>;
  pickFile(filters?: Electron.OpenDialogOptions['filters']): Promise<string[]>;
  quit(): void;
  showElectronMessageBox(message: string, type: MessageBoxOptions['type'], WindowName?: WindowNames): Promise<void>;
}
export const NativeServiceIPCDescriptor = {
  channel: NativeChannel.name,
  properties: {
    executeZxScript$: ProxyPropertyType.Function$,
    log: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    openInEditor: ProxyPropertyType.Function,
    openInGitGuiApp: ProxyPropertyType.Function,
    pickDirectory: ProxyPropertyType.Function,
    pickFile: ProxyPropertyType.Function,
    quit: ProxyPropertyType.Function,
    showElectronMessageBox: ProxyPropertyType.Function,
  },
};

export type IZxWorkerMessage = IZxWorkerLogMessage | IZxWorkerControlMessage;
export interface IZxWorkerLogMessage {
  message: string;
  type: 'stdout' | 'stderr';
}
export enum ZxWorkerControlActions {
  ended = 'ended',
  error = 'error',
  /** means worker is just started */
  start = 'start',
}
export interface IZxWorkerControlMessage {
  actions: ZxWorkerControlActions;
  message?: string;
  type: 'control';
}
