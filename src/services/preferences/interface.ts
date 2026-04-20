import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { PreferenceChannel } from '@/constants/channels';
import type { HunspellLanguages } from '@/constants/hunspellLanguages';
import type { BehaviorSubject } from 'rxjs';

/**
 * All user-configurable preferences.
 * This is the single source of truth for the TypeScript type.
 * The Zod schema in definitions/registry.ts validates against this at runtime.
 */
export interface IPreferences {
  aiGenerateBackupTitle: boolean;
  aiGenerateBackupTitleTimeout: number;
  allowPrerelease: boolean;
  alwaysOnTop: boolean;
  askForDownloadPath: boolean;
  disableAntiAntiLeech: boolean;
  disableAntiAntiLeechForUrls: string[];
  downloadPath: string;
  externalAPIDebug: boolean;
  hibernateUnusedWorkspacesAtLaunch: boolean;
  hideMenuBar: boolean;
  ignoreCertificateErrors: boolean;
  keyboardShortcuts: Record<string, string>;
  language: string;
  pauseNotifications?: string;
  pauseNotificationsBySchedule: boolean;
  pauseNotificationsByScheduleFrom: string;
  pauseNotificationsByScheduleTo: string;
  pauseNotificationsMuteAudio: boolean;
  rememberLastPageVisited: boolean;
  runOnBackground: boolean;
  shareWorkspaceBrowsingData: boolean;
  showSideBarIcon: boolean;
  showSideBarText: boolean;
  sidebar: boolean;
  spellcheck: boolean;
  spellcheckLanguages: HunspellLanguages[];
  swipeToNavigate: boolean;
  syncBeforeShutdown: boolean;
  syncDebounceInterval: number;
  syncOnlyWhenNoDraft: boolean;
  themeSource: 'system' | 'light' | 'dark';
  tidgiMiniWindow: boolean;
  tidgiMiniWindowAlwaysOnTop: boolean;
  tidgiMiniWindowFixedWorkspaceId?: string;
  tidgiMiniWindowShowSidebar: boolean;
  tidgiMiniWindowShowTitleBar: boolean;
  tidgiMiniWindowSyncWorkspaceWithMainWindow: boolean;
  titleBar: boolean;
  unreadCountBadge: boolean;
  useHardwareAcceleration: boolean;
}

export enum PreferenceSections {
  developers = 'developers',
  downloads = 'downloads',
  general = 'general',
  languages = 'languages',
  tidgiMiniWindow = 'tidgiMiniWindow',
  misc = 'misc',
  network = 'network',
  notifications = 'notifications',
  performance = 'performance',
  privacy = 'privacy',
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
