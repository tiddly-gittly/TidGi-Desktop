import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('Simplified Chinese locale parity', () => {
  for (const namespace of ['agent', 'translation']) {
    it(`contains every English ${namespace} key`, () => {
      const readLocale = (locale: string): unknown =>
        JSON.parse(
          fs.readFileSync(path.join(process.cwd(), 'localization', 'locales', locale, `${namespace}.json`), 'utf8'),
        );
      const englishKeys = flattenKeys(readLocale('en'));
      const chineseKeys = new Set(flattenKeys(readLocale('zh-Hans')));
      expect(englishKeys.filter(key => !chineseKeys.has(key))).toEqual([]);
    });
  }
});
