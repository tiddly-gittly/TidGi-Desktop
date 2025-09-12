import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { PreferenceChannel } from '@/constants/channels';
import type { HunspellLanguages } from '@/constants/hunspellLanguages';
import type { BehaviorSubject } from 'rxjs';

export interface IPreferences {
  allowPrerelease: boolean;
  alwaysOnTop: boolean;
  askForDownloadPath: boolean;
  attachToMenubar: boolean;
  /**
   * 完全关闭反盗链
   */
  disableAntiAntiLeech: boolean;
  /**
   * Only disable anti-leech for these urls
   */
  disableAntiAntiLeechForUrls: string[];
  downloadPath: string;
  /**
   * Enable debug logging for external API requests and responses
   */
  externalAPIDebug: boolean;
  hibernateUnusedWorkspacesAtLaunch: boolean;
  hideMenuBar: boolean;
  ignoreCertificateErrors: boolean;
  language: string;
  menuBarAlwaysOnTop: boolean;
  pauseNotifications: string | undefined;
  pauseNotificationsBySchedule: boolean;
  pauseNotificationsByScheduleFrom: string;
  pauseNotificationsByScheduleTo: string;
  pauseNotificationsMuteAudio: boolean;
  rememberLastPageVisited: boolean;
  runOnBackground: boolean;
  shareWorkspaceBrowsingData: boolean;
  showSideBarIcon: boolean;
  showSideBarText: boolean;
  /**
   * Should show sidebar on main window?
   */
  sidebar: boolean;
  /**
   * Should show sidebar on menubar window?
   */
  sidebarOnMenubar: boolean;
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
  languages = 'languages',
  misc = 'misc',
  network = 'network',
  notifications = 'notifications',
  performance = 'performance',
  privacy = 'privacy',
  search = 'search',
  sync = 'sync',
  system = 'system',
  updates = 'updates',
  wiki = 'wiki',
  externalAPI = 'externalAPI',
  aiAgent = 'aiAgent',
}

/**
 * Getter and setter for app business logic preferences.
 */
export interface IPreferenceService {
  get<K extends keyof IPreferences>(key: K): Promise<IPreferences[K]>;
  /**
   * get preferences, may return cached version
   */
  getPreferences(): IPreferences;
  /** Subscribable stream to get react component updated with latest preferences */
  preference$: BehaviorSubject<IPreferences | undefined>;
  reset(): Promise<void>;
  resetWithConfirm(): Promise<void>;
  /**
   * Update preferences, update cache and observable
   */
  set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void>;
  /**
   * Manually refresh the observable's content, that will be received by react component.
   */
  updatePreferenceSubject(): void;
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
    updatePreferenceSubject: ProxyPropertyType.Function,
  },
};
