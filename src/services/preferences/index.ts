import { inject, injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import type { IDatabaseService } from '@services/database/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { defaultPreferences } from './defaultPreferences';
import { networkProxiesSchema } from './definitions/preferenceSchemas';
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
    preferencesFromDisk = this.migrateLegacyAnalyticsDefault(preferencesFromDisk, this.databaseService);
    return { ...defaultPreferences, ...this.sanitizePreference(preferencesFromDisk) };
  };

  /**
   * Re-enable analytics for installs that inherited the old default-off value
   * without the user explicitly opting out after the first-run notice.
   */
  private migrateLegacyAnalyticsDefault(
    preferencesFromDisk: Partial<IPreferences>,
    databaseService: IDatabaseService,
  ): Partial<IPreferences> {
    const migrationVersion = 1;
    const analyticsSecrets = databaseService.getSetting('analyticsSecrets') ?? {};
    const storedVersion = analyticsSecrets.analyticsDefaultsMigrationVersion ?? 0;
    if (storedVersion >= migrationVersion) {
      return preferencesFromDisk;
    }

    const migrated = { ...preferencesFromDisk };
    if (
      migrated.analyticsEnabled === false &&
      (migrated.analyticsHost === undefined || migrated.analyticsHost === defaultPreferences.analyticsHost) &&
      (migrated.analyticsSiteId === undefined || migrated.analyticsSiteId === defaultPreferences.analyticsSiteId)
    ) {
      migrated.analyticsEnabled = true;
    }

    databaseService.setSetting('analyticsSecrets', {
      ...analyticsSecrets,
      analyticsDefaultsMigrationVersion: migrationVersion,
    });
    if (migrated.analyticsEnabled !== preferencesFromDisk.analyticsEnabled) {
      const existingPreferences = databaseService.getSetting('preferences') ?? defaultPreferences;
      databaseService.setSetting('preferences', { ...existingPreferences, ...migrated });
    }

    return migrated;
  }

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

    if (preferenceToSanitize.networkProxies !== undefined) {
      const input = preferenceToSanitize.networkProxies as Partial<IPreferences['networkProxies']>;
      const merged = {
        default: { ...defaultPreferences.networkProxies.default, ...input.default },
        wikiBackend: { ...defaultPreferences.networkProxies.wikiBackend, ...input.wikiBackend },
        wikiFrontend: { ...defaultPreferences.networkProxies.wikiFrontend, ...input.wikiFrontend },
        git: { ...defaultPreferences.networkProxies.git, ...input.git },
      };
      preferenceToSanitize.networkProxies = networkProxiesSchema.safeParse(merged).success
        ? merged
        : defaultPreferences.networkProxies;
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
