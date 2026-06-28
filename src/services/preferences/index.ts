import { inject, injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import type { IDatabaseService } from '@services/database/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { defaultPreferences } from './defaultPreferences';
import type { IPreferenceReactionHandler, IPreferenceResetWithConfirmHandler, IPreferences, IPreferenceService } from './interface';
import { getPreferenceDifferencesFromDefaults } from './utilities';

@injectable()
export class Preference implements IPreferenceService {
  private cachedPreferences: IPreferences | undefined;
  private reactionHandler: IPreferenceReactionHandler | undefined;
  private resetWithConfirmHandler: IPreferenceResetWithConfirmHandler | undefined;
  public preference$ = new BehaviorSubject<IPreferences | undefined>(undefined);

  constructor(
    @inject(serviceIdentifier.Database) private readonly databaseService: IDatabaseService,
  ) {}

  public setReactionHandler(handler: IPreferenceReactionHandler): void {
    this.reactionHandler = handler;
  }

  public setResetWithConfirmHandler(handler: IPreferenceResetWithConfirmHandler): void {
    this.resetWithConfirmHandler = handler;
  }

  public updatePreferenceSubject(): void {
    this.preference$.next(this.getPreferences());
  }

  public async resetWithConfirm(): Promise<void> {
    await this.resetWithConfirmHandler?.();
  }

  /**
   * load preferences in sync, and ensure it is an Object
   */
  private readonly getInitPreferencesForCache = (): IPreferences => {
    let preferencesFromDisk = this.databaseService.getSetting(`preferences`) ?? {};
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
    await this.reactionHandler?.(key, value);
  }

  /**
   * Batch update all preferences, update cache and observable.
   * Only saves preferences that differ from defaults to reduce storage size.
   */
  private async setPreferences(newPreferences: IPreferences): Promise<void> {
    this.cachedPreferences = newPreferences;

    // Only save preferences that differ from defaults
    const preferencesToSave = getPreferenceDifferencesFromDefaults(newPreferences, defaultPreferences);

    this.databaseService.setSetting('preferences', preferencesToSave as IPreferences);
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
