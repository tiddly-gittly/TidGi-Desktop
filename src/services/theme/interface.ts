import { ThemeChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export interface ITheme {
  shouldUseDarkColors: boolean;
}

/**
 * Wrap call to electron api, so we won't need remote module in renderer process
 */
export interface IThemeService {
  initialize(): Promise<void>;
  setThemeSource(themeSource: IThemeSource): Promise<void>;
  shouldUseDarkColors(): Promise<boolean>;
  theme$: BehaviorSubject<ITheme>;
}

export type IThemeSource = 'system' | 'light' | 'dark';

export const ThemeServiceIPCDescriptor = {
  channel: ThemeChannel.name,
  properties: {
    theme$: ProxyPropertyType.Value$,
  },
};
