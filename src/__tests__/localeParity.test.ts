/** @vitest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const localesDirectory = path.join(process.cwd(), 'localization', 'locales');
const locales = fs.readdirSync(localesDirectory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

function flattenValues(value: unknown, prefix = '', values: Record<string, string> = {}): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    values[prefix] = String(value);
    return values;
  }
  for (const [key, child] of Object.entries(value)) {
    flattenValues(child, prefix ? `${prefix}.${key}` : key, values);
  }
  return values;
}

function interpolationVariables(value: string): string[] {
  return [...value.matchAll(/{{\s*([^}\s]+)\s*}}/g)].map(match => match[1]).sort();
}

describe.each(['agent', 'translation'])('%s locale resources', namespace => {
  const readLocale = (locale: string) => flattenValues(JSON.parse(fs.readFileSync(path.join(localesDirectory, locale, `${namespace}.json`), 'utf8')));
  const english = readLocale('en');

  it.each(locales)('%s contains nonempty translations with matching interpolation variables', locale => {
    const translated = readLocale(locale);
    expect(Object.entries(translated).filter(([, value]) => value.trim() === '')).toEqual([]);
    for (const [key, value] of Object.entries(english)) {
      expect(translated, key).toHaveProperty([key]);
      expect(interpolationVariables(translated[key]), key).toEqual(interpolationVariables(value));
    }
  });
});

it.each([
  ['en', 'en'],
  ['fr', 'fr'],
  ['ja', 'ja'],
  ['ru', 'ru'],
  ['zh-Hans', 'zh_CN'],
  ['zh-Hant', 'zh_TW'],
])('%s maps scheduled task descriptions to the matching cron locale', (locale, descriptionLocale) => {
  const resource = flattenValues(JSON.parse(fs.readFileSync(path.join(localesDirectory, locale, 'agent.json'), 'utf8')));
  expect(resource['EditAgent.ScheduleCronLocale.cronDescriptionText']).toBe(descriptionLocale);
});
