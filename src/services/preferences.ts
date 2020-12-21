import { injectable } from 'inversify';
import path from 'path';
import semver from 'semver';
import settings from 'electron-settings';

import sendToAllWindows from './send-to-all-windows';
import { app, nativeTheme, ipcMain, remote } from 'electron';

const getDefaultDownloadsPath = () => path.join((app || remote.app).getPath('home'), 'Downloads');

const getDefaultPauseNotificationsByScheduleFrom = () => {
  const d = new Date();
  d.setHours(23);
  d.setMinutes(0);
  return d.toString();
};

const getDefaultPauseNotificationsByScheduleTo = () => {
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
  cssCodeInjection: undefined,
  customUserAgent: undefined,
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
  jsCodeInjection: undefined,
  language: 'zh_CN',
  navigationBar: false,
  pauseNotifications: undefined,
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

const initCachedPreferences = () => {
  cachedPreferences = { ...defaultPreferences, ...sanitizePreference(settings.getSync(`preferences.${v}`) || {}) };
};

export const getPreferences = () => {
  // store in memory to boost performance
  if (cachedPreferences === undefined) {
    initCachedPreferences();
  }
  return cachedPreferences;
};

export const getPreference = (name: any) => {
  // store in memory to boost performance
  if (cachedPreferences === undefined) {
    initCachedPreferences();
  }
  return cachedPreferences[name];
};


@injectable()
export class Preference {
  cachedPreferences: IPreferences;
  readonly version = '2018.2';

  constructor() {
    // load preferences, and ensure it is an Object
    let preferencesFromDisk = settings.getSync(`preferences.${this.version}`) ?? {};
    preferencesFromDisk = typeof preferencesFromDisk === 'object' && !Array.isArray(preferencesFromDisk) ? preferencesFromDisk : {};
    this.cachedPreferences = { ...defaultPreferences, ...this.sanitizePreference(preferencesFromDisk) };
  }

  /**
   * Make sure loaded or input preference are good, reset some bad values in preference
   * @param preferenceToSanitize User input preference or loaded preference, that may contains bad values
   */
  sanitizePreference(preferenceToSanitize: Partial<IPreferences>): Partial<IPreferences> {
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

  set(key: string, value: string): Promise<void> {
    sendToAllWindows('set-preference', key, value);
    this.cachedPreferences[key] = value;
    this.cachedPreferences = sanitizePreference(this.cachedPreferences);
  
    // eslint-disable-next-line promise/catch-or-return
    Promise.resolve().then(() => settings.setSync(`preferences.${v}.${key}`, this.cachedPreferences[key]));
  
    if (key.startsWith('darkReader')) {
      ipcMain.emit('request-reload-views-dark-reader');
    }
  
    if (key.startsWith('pauseNotifications')) {
      ipcMain.emit('request-update-pause-notifications-info');
    }
  
    if (key === 'themeSource') {
      nativeTheme.themeSource = value;
    }
  }

  public async reset() {
    cachedPreferences = undefined;
    await settings.unset();

    const preferences = getPreferences();
    Object.keys(preferences).forEach((name) => {
      sendToAllWindows('set-preference', name, preferences[name]);
    });
  }
}
