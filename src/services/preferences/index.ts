import { dialog, nativeTheme } from 'electron';
import { injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { i18n } from '@services/libs/i18n';
import { requestChangeLanguage } from '@services/libs/i18n/requestChangeLanguage';
import type { INotificationService } from '@services/notifications/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { defaultPreferences } from './defaultPreferences';
import type { IPreferences, IPreferenceService } from './interface';
import { getPreferenceDifferencesFromDefaults } from './utilities';

@injectable()
export class Preference implements IPreferenceService {
  private cachedPreferences: IPreferences | undefined;
  public preference$ = new BehaviorSubject<IPreferences | undefined>(undefined);

  public updatePreferenceSubject(): void {
    this.preference$.next(this.getPreferences());
  }

  public async resetWithConfirm(): Promise<void> {
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const preferenceWindow = windowService.get(WindowNames.preferences);
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
            await windowService.requestRestart();
          }
        })
        .catch(console.error);
    }
  }

  /**
   * load preferences in sync, and ensure it is an Object
   */
  private readonly getInitPreferencesForCache = (): IPreferences => {
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    let preferencesFromDisk = databaseService.getSetting(`preferences`) ?? {};
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
      syncDebounceInterval > 86_400_000 ||
      syncDebounceInterval < -86_400_000 ||
      !Number.isInteger(syncDebounceInterval)
    ) {
      preferenceToSanitize.syncDebounceInterval = defaultPreferences.syncDebounceInterval;
    }
    return preferenceToSanitize;
  }

  public async set<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void> {
    const preferences = this.getPreferences();
    preferences[key] = value;
    await this.setPreferences({ ...preferences, ...this.sanitizePreference(preferences) });
    await this.reactWhenPreferencesChanged(key, value);
  }

  /**
   * Do some side effect when config change, update other services or filesystem
   * @param preference new preference settings
   */
  private async reactWhenPreferencesChanged<K extends keyof IPreferences>(key: K, value: IPreferences[K]): Promise<void> {
    // maybe pauseNotificationsBySchedule or pauseNotifications or ...
    if (key.startsWith('pauseNotifications')) {
      const notificationService = container.get<INotificationService>(serviceIdentifier.NotificationService);
      await notificationService.updatePauseNotificationsInfo();
    }

    // Delegate window-related preference changes to WindowService
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    await windowService.reactWhenPreferencesChanged(key, value);

    switch (key) {
      case 'themeSource': {
        nativeTheme.themeSource = value as IPreferences['themeSource'];
        return;
      }
      case 'language': {
        await requestChangeLanguage(value as string);
        return;
      }
      default:
        break;
    }
  }

  /**
   * Batch update all preferences, update cache and observable.
   * Only saves preferences that differ from defaults to reduce storage size.
   */
  private async setPreferences(newPreferences: IPreferences): Promise<void> {
    this.cachedPreferences = newPreferences;

    // Only save preferences that differ from defaults
    const preferencesToSave = getPreferenceDifferencesFromDefaults(newPreferences, defaultPreferences);

    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('preferences', preferencesToSave);
    this.updatePreferenceSubject();
  }

  public getPreferences(): IPreferences {
    // store in memory to boost performance
    if (this.cachedPreferences === undefined) {
      return this.getInitPreferencesForCache();
    }
    return this.cachedPreferences;
  }

  public async get<K extends keyof IPreferences>(key: K): Promise<IPreferences[K]> {
    return this.getPreferences()[key];
  }

  public async reset(): Promise<void> {
    await this.setPreferences(defaultPreferences);
  }
}
