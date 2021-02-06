import { MessageBoxOptions } from 'electron';

import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { NativeChannel } from '@/constants/channels';
import { WindowNames } from '@services/windows/WindowProperties';

/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface INativeService {
  showElectronMessageBox(message: string, type: MessageBoxOptions['type'], WindowName?: WindowNames): Promise<void>;
  open(uri: string, isDirectory?: boolean): Promise<void>;
  quit(): void;
}
export const NativeServiceIPCDescriptor = {
  channel: NativeChannel.name,
  properties: {
    showElectronMessageBox: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    quit: ProxyPropertyType.Function,
  },
};
