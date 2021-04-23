import { BehaviorSubject } from 'rxjs';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { ThemeChannel } from '@/constants/channels';

export interface ITheme {
  shouldUseDarkColors: boolean;
}

/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface IThemeService {
  theme$: BehaviorSubject<ITheme>;
}
export const ThemeServiceIPCDescriptor = {
  channel: ThemeChannel.name,
  properties: {
    theme$: ProxyPropertyType.Value$,
  },
};
