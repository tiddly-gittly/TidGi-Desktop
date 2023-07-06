import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { PreferenceChannel } from '@/constants/channels';
import type { HunspellLanguages } from '@/constants/hunspellLanguages';
import type { ILanguageModelPreferences } from '@services/languageModel/interface';
import type { BehaviorSubject } from 'rxjs';

export interface IPreferences {
  allowPrerelease: boolean;
  alwaysOnTop: boolean;
  askForDownloadPath: boolean;
  attachToMenubar: boolean;
  downloadPath: string;
  hibernateUnusedWorkspacesAtLaunch: boolean;
  hideMenuBar: boolean;
  showSideBarIcon: boolean;
  ignoreCertificateErrors: boolean;
  language: string;
  languageModel: ILanguageModelPreferences;
  menuBarAlwaysOnTop: boolean;
  pauseNotifications: string | undefined;
  pauseNotificationsBySchedule: boolean;
  pauseNotificationsByScheduleFrom: string;
  pauseNotificationsByScheduleTo: string;
  pauseNotificationsMuteAudio: boolean;
  rememberLastPageVisited: boolean;
  shareWorkspaceBrowsingData: boolean;
  sidebar: boolean;
  showSideBarText: boolean;
  spellcheck: boolean;
  spellcheckLanguages: HunspellLanguages[];
  swipeToNavigate: boolean;
  syncBeforeShutdown: boolean;
  syncDebounceInterval: number;
  /**
   * Only start a sync when there are no draft (prevent your blog has a draft tiddler)
   */
  syncOnlyWhenNoDraft: boolean;
  themeSource: 'system' | 'light' | 'dark';
  titleBar: boolean;
  unreadCountBadge: boolean;
  useHardwareAcceleration: boolean;
}

export enum PreferenceSections {
  developers = 'developers',
  downloads = 'downloads',
  friendLinks = 'friendLinks',
  general = 'general',
  languageModel = 'languageModel',
  languages = 'languages',
  misc = 'misc',
  network = 'network',
  notifications = 'notifications',
  performance = 'performance',
  privacy = 'privacy',
  sync = 'sync',
  system = 'system',
  updates = 'updates',
  wiki = 'wiki',
}

/**
 * Getter and setter for app business logic preferences.
 */
export interface IPreferenceService {
  get<K extends keyof IPreferences>(key: K): Promise<IPreferences[K]>;
  /**
   * get preferences, may return cached version
   */
  getPreferences: () => Promise<IPreferences>;
  /** Subscribable stream to get react component updated with latest preferences */
  preference$: BehaviorSubject<IPreferences>;
  reset(): Promise<void>;
  resetWithConfirm(): Promise<void>;
  /**
   * Update preferences, update cache and observable
   */
  set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void>;
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
