import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';

import { PreferenceChannel } from '@/constants/channels';

export interface IPreferences {
  allowPrerelease: boolean;
  askForDownloadPath: boolean;
  attachToMenubar: boolean;
  blockAds: boolean;
  customUserAgent: string;
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
  navigationBar: boolean;
  pauseNotifications: string;
  pauseNotificationsBySchedule: boolean;
  pauseNotificationsByScheduleFrom: string;
  pauseNotificationsByScheduleTo: string;
  pauseNotificationsMuteAudio: boolean;
  proxyBypassRules: string;
  proxyPacScript: string;
  proxyRules: string;
  proxyType: string;
  rememberLastPageVisited: boolean;
  shareWorkspaceBrowsingData: boolean;
  sidebar: boolean;
  sidebarShortcutHints: boolean;
  spellcheck: boolean;
  spellcheckLanguages: string[];
  swipeToNavigate: boolean;
  syncDebounceInterval: number;
  themeSource: 'system' | 'light' | 'dark';
  titleBar: boolean;
  unreadCountBadge: boolean;
  useHardwareAcceleration: boolean;
}

/**
 * Getter and setter for app business logic preferences.
 */
export interface IPreferenceService {
  set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void>;
  getPreferences: () => IPreferences;
  get<K extends keyof IPreferences>(key: K): IPreferences[K];
  reset(): Promise<void>;
  resetWithConfirm(): Promise<void>;
}
export const PreferenceServiceIPCDescriptor = {
  channel: PreferenceChannel.name,
  properties: {
    set: ProxyPropertyType.Function,
    getPreferences: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    reset: ProxyPropertyType.Function,
    resetWithConfirm: ProxyPropertyType.Function,
  },
};
