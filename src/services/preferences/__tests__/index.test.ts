import type { IDatabaseService, ISettingFile } from '@services/database/interface';
import { Preference } from '@services/preferences';
import type { IPreferences } from '@services/preferences/interface';
import { describe, expect, it, vi } from 'vitest';

describe('Preference analytics default migration', () => {
  it('uses the injected database service while initializing preferences', () => {
    const settings: Partial<ISettingFile> = {
      analyticsSecrets: {},
      preferences: { analyticsEnabled: false } as IPreferences,
    };
    const databaseService = {
      getSetting: vi.fn(<K extends keyof ISettingFile>(key: K) => settings[key]),
      setSetting: vi.fn(<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]) => {
        settings[key] = value;
      }),
    } as unknown as IDatabaseService;

    const preferences = new Preference(databaseService).getPreferences();

    expect(preferences.analyticsEnabled).toBe(true);
    expect(settings.analyticsSecrets?.analyticsDefaultsMigrationVersion).toBe(1);
    expect(settings.preferences?.analyticsEnabled).toBe(true);
  });
});
