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

  it('contains the scheduled wake-up editor keys in every supported locale', () => {
    const scheduledWakeupKeys = [
      'ActiveHoursEnd',
      'ActiveHoursStart',
      'Hours',
      'Minutes',
      'Seconds',
      'ScheduledWakeup',
      'ScheduledWakeupDescription',
      'ScheduleCron',
      'ScheduleCronExpr',
      'ScheduleCronHelp',
      'ScheduleCronPreview',
      'ScheduleDaily',
      'ScheduleDailyTime',
      'ScheduleInterval',
      'ScheduleIntervalUnit',
      'ScheduleIntervalValue',
      'ScheduleMessage',
      'ScheduleMessagePlaceholder',
      'ScheduleMode',
      'ScheduleNone',
      'ScheduleSave',
      'ScheduleSaveWait',
      'ScheduleSaving',
      'ScheduleTimezone',
      'ScheduleUpdate',
    ];

    for (const locale of ['en', 'fr', 'ja', 'ru', 'zh-Hans', 'zh-Hant']) {
      const agentLocale = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'localization', 'locales', locale, 'agent.json'), 'utf8'),
      ) as { EditAgent?: Record<string, unknown> };
      expect(scheduledWakeupKeys.filter(key => !(key in (agentLocale.EditAgent ?? {}))), locale).toEqual([]);
    }
  });
});
