import { injectable, inject } from 'inversify';
import { app, App, nativeTheme, ipcMain, remote } from 'electron';
import path from 'path';
import semver from 'semver';
import settings from 'electron-settings';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Window } from '@/services/window';
import { PreferenceChannel } from '@/services/channels';

/** get path, note that if use this from the preload script, app will be undefined, so have to use remote.app here */
const getDefaultDownloadsPath = (): string => {
  const availableApp = (app as App | undefined) === undefined ? remote.app : app;
  return path.join(availableApp.getPath('home'), 'Downloads');
};

const getDefaultPauseNotificationsByScheduleFrom = (): string => {
  const d = new Date();
  d.setHours(23);
  d.setMinutes(0);
  return d.toString();
};

const getDefaultPauseNotificationsByScheduleTo = (): string => {
  const d = new Date();
  d.setHours(7);
  d.setMinutes(0);
  return d.toString();
};

const defaultPreferences = {
  allowNodeInJsCodeInjection: false,
  allowPrerelease: Boolean(semver.prerelease(app.getVersion())),
  askForDownloadPath: true,
  attachToMenubar: false,
  blockAds: false,
  cssCodeInjection: '',
  customUserAgent: '',
  // default Dark Reader settings from its Chrome extension
  darkReader: false,
  darkReaderBrightness: 100,
  darkReaderContrast: 100,
  darkReaderGrayscale: 0,
  darkReaderSepia: 0,
  // default Dark Reader settings from its Chrome extension
  downloadPath: getDefaultDownloadsPath(),
  hibernateUnusedWorkspacesAtLaunch: false,
  hideMenuBar: false,
  ignoreCertificateErrors: false,
  jsCodeInjection: '',
  language: 'zh_CN',
  navigationBar: false,
  pauseNotifications: '',
  pauseNotificationsBySchedule: false,
  pauseNotificationsByScheduleFrom: getDefaultPauseNotificationsByScheduleFrom(),
  pauseNotificationsByScheduleTo: getDefaultPauseNotificationsByScheduleTo(),
  pauseNotificationsMuteAudio: false,
  proxyBypassRules: '',
  proxyPacScript: '',
  proxyRules: '',
  proxyType: 'none',
  rememberLastPageVisited: false,
  shareWorkspaceBrowsingData: false,
  sidebar: true,
  sidebarShortcutHints: true,
  spellcheck: true,
  spellcheckLanguages: ['en-US'],
  swipeToNavigate: true,
  syncDebounceInterval: 1000 * 60 * 30,
  themeSource: 'system',
  titleBar: true,
  unreadCountBadge: true,
  useHardwareAcceleration: true,
};
export type IPreferences = typeof defaultPreferences;

@injectable()
export class Preference {
  windowService: Window;

  cachedPreferences: IPreferences;
  readonly version = '2018.2';

  constructor(@inject(serviceIdentifiers.Window) windowService: Window) {
    this.windowService = windowService;
    this.cachedPreferences = this.getInitPreferencesForCache();
  }

  /**
   * load preferences in sync, and ensure it is an Object
   */
  getInitPreferencesForCache = (): IPreferences => {
    let preferencesFromDisk = settings.getSync(`preferences.${this.version}`) ?? {};
    preferencesFromDisk = typeof preferencesFromDisk === 'object' && !Array.isArray(preferencesFromDisk) ? preferencesFromDisk : {};
    return { ...defaultPreferences, ...this.sanitizePreference(preferencesFromDisk) };
  };

  /**
   * Pure function that make sure loaded or input preference are good, reset some bad values in preference
   * @param preferenceToSanitize User input preference or loaded preference, that may contains bad values
   */
  private sanitizePreference(preferenceToSanitize: Partial<IPreferences>): Partial<IPreferences> {
    const { syncDebounceInterval } = preferenceToSanitize;
    if (
      typeof syncDebounceInterval !== 'number' ||
      syncDebounceInterval > 86400000 ||
      syncDebounceInterval < -86400000 ||
      !Number.isInteger(syncDebounceInterval)
    ) {
      preferenceToSanitize.syncDebounceInterval = defaultPreferences.syncDebounceInterval;
    }
    return preferenceToSanitize;
  }

  public async set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void> {
    this.windowService.sendToAllWindows(PreferenceChannel.update, key, value);
    this.cachedPreferences[key] = value;
    this.cachedPreferences = { ...this.cachedPreferences, ...this.sanitizePreference(this.cachedPreferences) };

    // eslint-disable-next-line promise/catch-or-return
    await settings.set(`preferences.${this.version}.${key}`, this.cachedPreferences[key]);

    // TODO: call ThemeService and NotificationService
    // if (key.startsWith('darkReader')) {
    //   ipcMain.emit('request-reload-views-dark-reader');
    // }

    // if (key.startsWith('pauseNotifications')) {
    //   ipcMain.emit('request-update-pause-notifications-info');
    // }

    // if (key === 'themeSource') {
    //   nativeTheme.themeSource = value;
    // }
  }

  /**
   * get preferences, may return cached version
   */
  public getPreferences = (): IPreferences => {
    // store in memory to boost performance
    if (this.cachedPreferences === undefined) {
      return this.getInitPreferencesForCache();
    }
    return this.cachedPreferences;
  };

  public get<K extends keyof IPreferences>(key: K): IPreferences[K] {
    return this.cachedPreferences[key];
  }

  private async setPreferences(newPreferences: IPreferences): Promise<void> {
    await settings.set(`preferences.${this.version}`, newPreferences);
  }

  public async reset(): Promise<void> {
    await settings.unset();
    const preferences = this.getPreferences();
    this.cachedPreferences = preferences;
    await this.setPreferences(preferences);
    Object.keys(preferences).forEach((key) => {
      const value = preferences[key as keyof IPreferences];
      this.windowService.sendToAllWindows(PreferenceChannel.update, key, value);
    });
  }
}
