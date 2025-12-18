import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { PreferenceChannel } from '@/constants/channels';
import type { HunspellLanguages } from '@/constants/hunspellLanguages';
import type { BehaviorSubject } from 'rxjs';

export interface IPreferences {
  allowPrerelease: boolean;
  alwaysOnTop: boolean;
  askForDownloadPath: boolean;
  tidgiMiniWindow: boolean;
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
  tidgiMiniWindowAlwaysOnTop: boolean;
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
   * Should show sidebar on tidgi mini window?
   */
  tidgiMiniWindowShowSidebar: boolean;
  spellcheck: boolean;
  spellcheckLanguages: HunspellLanguages[];
  swipeToNavigate: boolean;
  /**
   * Whether menubar window should show the same workspace as main window
   */
  tidgiMiniWindowSyncWorkspaceWithMainWindow: boolean;
  /**
   * The workspace ID that tidgi mini window should always show when tidgiMiniWindowSyncWorkspaceWithMainWindow is false
   */
  tidgiMiniWindowFixedWorkspaceId: string | undefined;
  /**
   * Whether to show title bar on tidgi mini window (independent of main window's titleBar setting)
   */
  tidgiMiniWindowShowTitleBar: boolean;
  /**
   * Keyboard shortcuts configuration stored as serviceIdentifier.methodName -> shortcut
   */
  keyboardShortcuts: Record<string, string>;
  syncBeforeShutdown: boolean;
  syncDebounceInterval: number;
  /**
   * Only start a sync when there are no draft (prevent your blog has a draft tiddler)
   */
  syncOnlyWhenNoDraft: boolean;
  /**
   * Whether to use AI to generate backup/commit titles
   */
  aiGenerateBackupTitle: boolean;
  /**
   * Timeout for AI-generated backup title in milliseconds
   */
  aiGenerateBackupTitleTimeout: number;
  themeSource: 'system' | 'light' | 'dark';
  titleBar: boolean;
  unreadCountBadge: boolean;
  useHardwareAcceleration: boolean;
}

/**
 * Get only the fields that differ from defaults, for persisting to storage.
 * This reduces storage size and makes configs more readable by only storing non-default values.
 * @param preferences The preferences object with all fields
 * @param defaults The default preferences object
 * @returns An object containing only fields that differ from defaults
 */
export function getPreferenceDifferencesFromDefaults(preferences: IPreferences, defaults: IPreferences): Partial<IPreferences> {
  const differences = {} as Partial<IPreferences>;
  const keys = Object.keys(preferences) as Array<keyof IPreferences>;
  
  keys.forEach((key) => {
    const defaultValue = defaults[key];
    const preferenceValue = preferences[key];
    
    // For complex types like objects and arrays, do deep comparison
    if (typeof defaultValue === 'object' && typeof preferenceValue === 'object') {
      if (JSON.stringify(defaultValue) !== JSON.stringify(preferenceValue)) {
        (differences as Record<string, unknown>)[key] = preferenceValue;
      }
    } else if (defaultValue !== preferenceValue) {
      (differences as Record<string, unknown>)[key] = preferenceValue;
    }
  });
  
  return differences;
}

export enum PreferenceSections {
  developers = 'developers',
  downloads = 'downloads',
  friendLinks = 'friendLinks',
  general = 'general',
  languages = 'languages',
  tidgiMiniWindow = 'tidgiMiniWindow',
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
