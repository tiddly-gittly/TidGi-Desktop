import { isEqual } from 'lodash';
import type { IPreferences } from './interface';

/**
 * Get only the fields that differ from defaults, for persisting to storage.
 * This reduces storage size and makes configs more readable by only storing non-default values.
 * @param preferences The preferences object with all fields
 * @param defaults The default preferences object
 * @returns An object containing only fields that differ from defaults
 */
export function getPreferenceDifferencesFromDefaults(preferences: IPreferences, defaults: IPreferences): Partial<IPreferences> {
  const differences = {} as Partial<IPreferences>;
  const keys = Object.keys(preferences) as Array<keyof IPreferences>;

  keys.forEach((key) => {
    const defaultValue = defaults[key];
    const preferenceValue = preferences[key];

    // Use deep equality check for all types
    if (!isEqual(defaultValue, preferenceValue)) {
      (differences as Record<string, unknown>)[key] = preferenceValue;
    }
  });

  return differences;
}
