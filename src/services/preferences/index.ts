import { BehaviorSubject } from 'rxjs';
import { injectable } from 'inversify';
import { dialog, nativeTheme } from 'electron';
import settings from 'electron-settings';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import type { INotificationService } from '@services/notifications/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import i18n from '@services/libs/i18n';
import { IPreferences, IPreferenceService } from './interface';
import { IViewService } from '@services/view/interface';
import { defaultPreferences } from './defaultPreferences';
import { lazyInject } from '@services/container';

@injectable()
export class Preference implements IPreferenceService {
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.View) private readonly viewService!: IViewService;
  @lazyInject(serviceIdentifier.NotificationService) private readonly notificationService!: INotificationService;

  private cachedPreferences: IPreferences;
  public preference$: BehaviorSubject<IPreferences>;
  readonly version = '2018.2';

  constructor() {
    this.cachedPreferences = this.getInitPreferencesForCache();
    this.preference$ = new BehaviorSubject<IPreferences>(this.cachedPreferences);
  }

  private updatePreferenceSubject(): void {
    this.preference$.next(this.cachedPreferences);
  }

  public async resetWithConfirm(): Promise<void> {
    const preferenceWindow = this.windowService.get(WindowNames.preferences);
    if (preferenceWindow !== undefined) {
      await dialog
        .showMessageBox(preferenceWindow, {
          type: 'question',
          buttons: [i18n.t('Preference.ResetNow'), i18n.t('Cancel')],
          message: i18n.t('Preference.Reset'),
          cancelId: 1,
        })
        .then(async ({ response }) => {
          if (response === 0) {
            await this.reset();
            await this.windowService.requestShowRequireRestartDialog();
          }
        })
        .catch(console.error);
    }
  }

  /**
   * load preferences in sync, and ensure it is an Object
   */
  private readonly getInitPreferencesForCache = (): IPreferences => {
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

  public set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): void {
    this.cachedPreferences[key] = value;
    this.cachedPreferences = { ...this.cachedPreferences, ...this.sanitizePreference(this.cachedPreferences) };

    void settings.set(`preferences.${this.version}.${key}`, this.cachedPreferences[key] as any);

    this.reactWhenPreferencesChanged(key, value);
    this.updatePreferenceSubject();
  }

  /**
   * Do some side effect when config change, update other services or filesystem
   * @param preference new preference settings
   */
  private reactWhenPreferencesChanged<K extends keyof IPreferences>(key: K, value: IPreferences[K]): void {
    // maybe pauseNotificationsBySchedule or pauseNotifications or ...
    if (key.startsWith('pauseNotifications')) {
      this.notificationService.updatePauseNotificationsInfo();
    }
    if (key === 'themeSource') {
      nativeTheme.themeSource = value as IPreferences['themeSource'];
    }
  }

  /**
   * Batch update all preferences, update cache and observable
   */
  private async setPreferences(newPreferences: IPreferences): Promise<void> {
    this.cachedPreferences = newPreferences;
    await settings.set(`preferences.${this.version}`, { ...newPreferences } as any);
    this.updatePreferenceSubject();
  }

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
  }
}
