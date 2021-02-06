import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { ThemeChannel } from '@/constants/channels';

/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface IThemeService {
  shouldUseDarkColors(): boolean;
}
export const ThemeServiceIPCDescriptor = {
  channel: ThemeChannel.name,
  properties: {
    shouldUseDarkColors: ProxyPropertyType.Function,
  },
};
