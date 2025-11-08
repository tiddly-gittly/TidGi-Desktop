import { ThemeChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

/**
 * TiddlyWiki tag for dark/light mode change actions
 * Tiddlers with this tag will be invoked when theme changes
 */
export const DARK_LIGHT_CHANGE_ACTIONS_TAG = '$:/tags/DarkLightChangeActions';

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
