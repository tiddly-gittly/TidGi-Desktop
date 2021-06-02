import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';

import { PreferenceChannel } from '@/constants/channels';
import { BehaviorSubject } from 'rxjs';
import { HunspellLanguages } from '@/constants/hunspellLanguages';

export interface IPreferences {
  allowPrerelease: boolean;
  askForDownloadPath: boolean;
  attachToMenubar: boolean;
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
  alwaysOnTop: boolean;
}

export enum PreferenceSections {
  wiki = 'wiki',
  sync = 'sync',
  general = 'general',
  notifications = 'notifications',
  languages = 'languages',
  downloads = 'downloads',
  network = 'network',
  privacy = 'privacy',
  system = 'system',
  developers = 'developers',
  performance = 'performance',
  updates = 'updates',
  friendLinks = 'friendLinks',
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
  set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void>;
  /**
   * get preferences, may return cached version
   */
  getPreferences: () => Promise<IPreferences>;
  get<K extends keyof IPreferences>(key: K): Promise<IPreferences[K]>;
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
