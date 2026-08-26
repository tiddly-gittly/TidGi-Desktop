import { describe, expect, it } from 'vitest';
import { resolveScheduledTaskLocale } from '../scheduledTaskLocales';

describe('resolveScheduledTaskLocale', () => {
  it.each([
    ['en-US', 'en', 'en', undefined],
    ['fr-FR', 'fr', 'en', 'fr'],
    ['ja-JP', 'ja', 'en', 'ja'],
    ['ru-RU', 'ru', 'en', 'ru'],
    ['zh-Hans-CN', 'zh-Hans', 'zh_CN', undefined],
    ['zh-Hant-TW', 'zh-Hant', 'en', 'zh_TW'],
  ])('maps %s without falling back to an unrelated language', (language, dateLocale, cronLocale, descriptionLocale) => {
    const result = resolveScheduledTaskLocale(language);
    expect(result.dateLocale).toBe(dateLocale);
    expect(result.cronLocale).toBe(cronLocale);
    expect(result.customLocale?.cronDescriptionText).toBe(descriptionLocale);
  });
});
