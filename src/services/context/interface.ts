import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { ContextChannel } from '@/constants/channels';

export interface IPaths {
  CHROME_ERROR_PATH: string;
  DEFAULT_WIKI_FOLDER: string;
  DESKTOP_PATH: string;
  LOCALIZATION_FOLDER: string;
  LOGIN_REDIRECT_PATH: string;
  LOG_FOLDER: string;
  MAIN_WINDOW_WEBPACK_ENTRY: string;
  MENUBAR_ICON_PATH: string;
  SETTINGS_FOLDER: string;
  TIDDLERS_PATH: string;
  TIDDLYWIKI_TEMPLATE_FOLDER_PATH: string;
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

export interface IContext extends IPaths, IConstants {}

/**
 * Manage constant value like `isDevelopment` and many else, so you can know about about running environment in main and renderer process easily.
 */
export interface IContextService {
  get<K extends keyof IContext>(key: K): Promise<IContext[K]>;
}
export const ContextServiceIPCDescriptor = {
  channel: ContextChannel.name,
  properties: {
    get: ProxyPropertyType.Function,
  },
};
