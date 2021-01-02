import { injectable } from 'inversify';
import getDecorators from 'inversify-inject-decorators';
import { app, App, remote, ipcMain, dialog } from 'electron';
import path from 'path';
import semver from 'semver';
import settings from 'electron-settings';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Window } from '@/services/windows';
import { WorkspaceView } from '@/services/workspacesView';
import { Notification } from '@/services/notifications';
import { WindowNames } from '@/services/windows/WindowProperties';
import { PreferenceChannel } from '@/services/channels';
import { container } from '@/services/container';
import i18n from '@/services/libs/i18n';

const { lazyInject } = getDecorators(container);

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
  themeSource: 'system' as 'system' | 'light' | 'dark',
  titleBar: true,
  unreadCountBadge: true,
  useHardwareAcceleration: true,
};
export type IPreferences = typeof defaultPreferences;

@injectable()
export class Preference {
  @lazyInject(serviceIdentifiers.Window) private readonly windowService!: Window;
  @lazyInject(serviceIdentifiers.Notification) private readonly notificationService!: Notification;
  @lazyInject(serviceIdentifiers.WorkspaceView) private readonly workspaceViewService!: WorkspaceView;

  cachedPreferences: IPreferences;
  readonly version = '2018.2';

  constructor() {
    this.cachedPreferences = this.getInitPreferencesForCache();
    this.init();
  }

  init(): void {
    ipcMain.on(PreferenceChannel.requestResetPreferences, () => {
      const preferenceWindow = this.windowService.get(WindowNames.preferences);
      if (preferenceWindow !== undefined) {
        dialog
          .showMessageBox(preferenceWindow, {
            type: 'question',
            buttons: [i18n.t('Preference.ResetNow'), i18n.t('Cancel')],
            message: i18n.t('Preference.Reset'),
            cancelId: 1,
          })
          .then(async ({ response }) => {
            if (response === 0) {
              await this.reset();
              ipcMain.emit(PreferenceChannel.requestShowRequireRestartDialog);
            }
          })
          .catch(console.error);
      }
    });
    ipcMain.on(PreferenceChannel.requestClearBrowsingData, () => {
      const availableWindowToShowDialog = this.windowService.get(WindowNames.preferences) ?? this.windowService.get(WindowNames.main);
      if (availableWindowToShowDialog !== undefined) {
        dialog
          .showMessageBox(availableWindowToShowDialog, {
            type: 'question',
            buttons: [i18n.t('Preference.ResetNow'), i18n.t('Cancel')],
            message: i18n.t('Preference.ClearBrowsingDataMessage'),
            cancelId: 1,
          })
          .then(({ response }) => {
            if (response === 0) {
              return this.workspaceViewService.clearBrowsingData();
            }
          })
          .catch(console.error);
      }
    });

    ipcMain.on(PreferenceChannel.getPreference, (event, name: keyof IPreferences) => {
      event.returnValue = this.get(name);
    });
    ipcMain.on(PreferenceChannel.getPreferences, (event) => {
      event.returnValue = this.cachedPreferences;
    });
    ipcMain.on(PreferenceChannel.requestSetPreference, <K extends keyof IPreferences>(_: unknown, key: K, value: IPreferences[K]): void => {
      void this.set(key, value);
    });
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

    this.reactWhenPreferencesChanged(key, value);
  }

  /**
   * Do some side effect when config change, update other services or filesystem
   * @param preference new preference settings
   */
  private reactWhenPreferencesChanged<K extends keyof IPreferences>(key: K, value: IPreferences[K]): void {
    // TODO: call ThemeService
    // if (key.startsWith('darkReader')) {
    //   ipcMain.emit('request-reload-views-dark-reader');
    // }
    // maybe pauseNotificationsBySchedule or pauseNotifications or ...
    if (key.startsWith('pauseNotifications')) {
      this.notificationService.updatePauseNotificationsInfo();
    }
    // if (key === 'themeSource') {
    //   nativeTheme.themeSource = value;
    // }
  }

  /**
   * Batch update all preferences
   */
  private async setPreferences(newPreferences: IPreferences): Promise<void> {
    await settings.set(`preferences.${this.version}`, newPreferences);
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

  // TODO: handle preferencesScrollTo
}
