import { ContextChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

export interface IPaths {
  CHROME_ERROR_PATH: string;
  DEFAULT_FIRST_WIKI_NAME: string;
  DEFAULT_FIRST_WIKI_PATH: string;
  DEFAULT_FIRST_WIKI_FOLDER_PATH: string;
  DESKTOP_PATH: string;
  HTTPS_CERT_KEY_FOLDER: string;
  LOCALIZATION_FOLDER: string;
  LOG_FOLDER: string;
  MAIN_WINDOW_WEBPACK_ENTRY: string;
  TIDGI_MINI_WINDOW_ICON_PATH: string;
  SETTINGS_FOLDER: string;
  TIDDLERS_PATH: string;
  TIDDLYWIKI_TEMPLATE_FOLDER_PATH: string;
  V8_CACHE_FOLDER: string;
}

/**
 * Available values about running environment
 */
export interface IConstants {
  appName: string;
  appVersion: string;
  environmentVersions: NodeJS.ProcessVersions;
  isDevelopment: boolean;
  oSVersion: string;
  platform: string;
}

export interface IContext extends IPaths, IConstants {
  supportedLanguagesMap: Record<string, string>;
  tiddlywikiLanguagesMap: Record<string, string | undefined>;
}

/**
 * Manage constant value like `isDevelopment` and many else, so you can know about about running environment in main and renderer process easily.
 */
export interface IContextService {
  get<K extends keyof IContext>(key: K): Promise<IContext[K]>;
  /**
   * Initialize language maps after app is ready.
   * Must be called early in app initialization before any code tries to access language maps.
   */
  initialize(): Promise<void>;
  isOnline(): Promise<boolean>;
}
export const ContextServiceIPCDescriptor = {
  channel: ContextChannel.name,
  properties: {
    get: ProxyPropertyType.Function,
    initialize: ProxyPropertyType.Function,
    isOnline: ProxyPropertyType.Function,
  },
};
