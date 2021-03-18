import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';

import { PreferenceChannel } from '@/constants/channels';
import { BehaviorSubject } from 'rxjs';
import { HunspellLanguages } from '@/constants/hunspell-languages';

export interface IPreferences {
  allowPrerelease: boolean;
  askForDownloadPath: boolean;
  attachToMenubar: boolean;
  blockAds: boolean;
  darkReader: boolean;
  darkReaderBrightness: number;
  darkReaderContrast: number;
  darkReaderGrayscale: number;
  darkReaderSepia: number;
  downloadPath: string;
  hibernateUnusedWorkspacesAtLaunch: boolean;
  hideMenuBar: boolean;
  ignoreCertificateErrors: boolean;
  language: string;
  pauseNotifications: string | undefined;
  pauseNotificationsBySchedule: boolean;
  pauseNotificationsByScheduleFrom: string;
  pauseNotificationsByScheduleTo: string;
  pauseNotificationsMuteAudio: boolean;
  rememberLastPageVisited: boolean;
  shareWorkspaceBrowsingData: boolean;
  sidebar: boolean;
  sidebarShortcutHints: boolean;
  spellcheck: boolean;
  spellcheckLanguages: HunspellLanguages[];
  swipeToNavigate: boolean;
  syncDebounceInterval: number;
  themeSource: 'system' | 'light' | 'dark';
  titleBar: boolean;
  unreadCountBadge: boolean;
  useHardwareAcceleration: boolean;
}

export enum PreferenceSections {
  wiki = 'wiki',
  sync = 'sync',
  general = 'general',
  extensions = 'extensions',
  notifications = 'notifications',
  languages = 'languages',
  downloads = 'downloads',
  network = 'network',
  privacy = 'privacy',
  system = 'system',
  developers = 'developers',
  advanced = 'advanced',
  updates = 'updates',
  reset = 'reset',
  webCatalogApps = 'webCatalogApps',
  misc = 'misc',
}

/**
 * Getter and setter for app business logic preferences.
 */
export interface IPreferenceService {
  /** Subscribable stream to get react component updated with latest preferences */
  preference$: BehaviorSubject<IPreferences>;
  /**
   * Update preferences, update cache and observable
   */
  set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): void;
  /**
   * get preferences, may return cached version
   */
  getPreferences: () => IPreferences;
  get<K extends keyof IPreferences>(key: K): IPreferences[K];
  reset(): Promise<void>;
  resetWithConfirm(): Promise<void>;
}
export const PreferenceServiceIPCDescriptor = {
  channel: PreferenceChannel.name,
  properties: {
    preference$: ProxyPropertyType.Value$,
    set: ProxyPropertyType.Function,
    getPreferences: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
    resetWithConfirm: ProxyPropertyType.Function,
  },
};
