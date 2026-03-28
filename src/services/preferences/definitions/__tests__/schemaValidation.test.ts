/**
 * Tests that validate the section definition schemas are well-formed.
 * These tests import only from the definitions/ layer (no Node backend deps),
 * ensuring the schema stays frontend-safe and self-consistent.
 */
import { allSections, getAllPreferenceItems, zodPreferencesSchema } from '@services/preferences/definitions/registry';
import { preferenceItemDefinitionSchema, sectionDefinitionDataSchema } from '@services/preferences/definitions/types';
import { type IPreferences, PreferenceSections } from '@services/preferences/interface';
import { describe, expect, it } from 'vitest';

describe('Section Definition Schema Validation', () => {
  it('every section validates against the Zod section schema', () => {
    for (const section of allSections) {
      const result = sectionDefinitionDataSchema.safeParse(section);
      if (!result.success) {
        throw new Error(`Section "${section.id}" failed schema validation: ${result.error.message}`);
      }
    }
  });

  it('every item validates against the item discriminated union schema', () => {
    for (const section of allSections) {
      for (const item of section.items) {
        const result = preferenceItemDefinitionSchema.safeParse(item);
        if (!result.success) {
          throw new Error(`Item in "${section.id}" failed validation: ${result.error.message}\nItem: ${JSON.stringify(item, null, 2)}`);
        }
      }
    }
  });

  it('all section ids match PreferenceSections enum values', () => {
    const sectionIds = new Set(allSections.map((s) => s.id));
    // import the enum values at type-level to ensure consistency
    const enumValues = Object.values(PreferenceSections);
    for (const v of enumValues) {
      expect(sectionIds.has(v), `Section "${v}" declared in PreferenceSections but not in allSections`).toBe(true);
    }
  });

  it('no duplicate preference keys across sections', () => {
    const seen = new Map<string, string>();
    for (const section of allSections) {
      for (const item of section.items) {
        if ('key' in item && item.type.startsWith('preference-')) {
          const existing = seen.get(item.key as string);
          if (existing) {
            throw new Error(`Duplicate preference key "${item.key}" in sections "${existing}" and "${section.id}"`);
          }
          seen.set(item.key as string, section.id);
        }
      }
    }
  });

  it('getAllPreferenceItems returns all preference-backed items', () => {
    const items = getAllPreferenceItems();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.type).toMatch(/^preference-/);
      expect(item.key).toBeDefined();
      expect(item.zod).toBeDefined();
    }
  });

  it('zodPreferencesSchema covers all IPreferences keys', () => {
    const schemaKeys = new Set(Object.keys(zodPreferencesSchema.shape));
    const requiredKeys: Array<keyof IPreferences> = [
      'themeSource',
      'sidebar',
      'spellcheck',
      'language',
      'syncBeforeShutdown',
      'syncDebounceInterval',
      'tidgiMiniWindow',
      'useHardwareAcceleration',
      'keyboardShortcuts',
      'spellcheckLanguages',
    ];
    for (const key of requiredKeys) {
      expect(schemaKeys.has(key), `Missing key "${key}" in zodPreferencesSchema`).toBe(true);
    }
  });

  it('every action item has a non-empty handler string', () => {
    for (const section of allSections) {
      for (const item of section.items) {
        if (item.type === 'action') {
          expect(item.handler.length, `Empty handler in section "${section.id}"`).toBeGreaterThan(0);
          expect(item.handler).toContain('.');
        }
      }
    }
  });

  it('every custom item has a non-empty componentId', () => {
    for (const section of allSections) {
      for (const item of section.items) {
        if (item.type === 'custom') {
          expect(item.componentId.length, `Empty componentId in section "${section.id}"`).toBeGreaterThan(0);
        }
      }
    }
  });
});
