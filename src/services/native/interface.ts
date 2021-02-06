import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { NativeChannel } from '@/constants/channels';
import { WindowNames } from '@services/windows/WindowProperties';

/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface INativeService {
  showMessageBox(WindowName: WindowNames, message: string, type: string): Promise<void>;
  open(uri: string, isDirectory?: boolean): Promise<void>;
  quit(): void;
}
export const NativeServiceIPCDescriptor = {
  channel: NativeChannel.name,
  properties: {
    showMessageBox: ProxyPropertyType.Function,
    open: ProxyPropertyType.Function,
    quit: ProxyPropertyType.Function,
  },
};
