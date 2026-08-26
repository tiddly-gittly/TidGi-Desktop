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
      'ScheduleExecutionTarget',
      'ScheduleExecutionTargetUnavailable',
      'ScheduleIdentityLoading',
      'ScheduleIdentityError',
      'ScheduleDefaultTaskName',
      'ScheduleDaily',
      'ScheduleDailyTime',
      'ScheduleInterval',
      'ScheduleIntervalUnit',
      'ScheduleIntervalValue',
      'ScheduleInvalidCron',
      'ScheduleInvalidTimezone',
      'ScheduleMessage',
      'ScheduleMessagePlaceholder',
      'ScheduleMode',
      'ScheduleNone',
      'ScheduleNoPreview',
      'SchedulePreviewLoading',
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

  it('contains every shared chat-shell label in every supported locale', () => {
    const executionTargetKeys = [
      'AnotherTarget',
      'ConfirmDescription',
      'ConfirmTitle',
      'KeepRunning',
      'Label',
      'RunOn',
      'RunOnTarget',
      'StopAndRestart',
    ];
    const messageKeys = [
      'AttachmentAlt',
      'DetailLine',
      'Error',
      'HideDetails',
      'LoadDetails',
      'NoDetails',
      'ShowDetails',
      'ToolCall',
      'ToolResult',
      'Truncated',
    ];

    for (const locale of ['en', 'fr', 'ja', 'ru', 'zh-Hans', 'zh-Hant']) {
      const agentLocale = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'localization', 'locales', locale, 'agent.json'), 'utf8'),
      ) as { Chat?: { ExecutionTarget?: Record<string, unknown>; Message?: Record<string, unknown> } };
      expect(executionTargetKeys.filter(key => !(key in (agentLocale.Chat?.ExecutionTarget ?? {}))), locale).toEqual([]);
      expect(messageKeys.filter(key => !(key in (agentLocale.Chat?.Message ?? {}))), locale).toEqual([]);
    }
  });

  it('contains the provider identifier validation message in every supported locale', () => {
    for (const locale of ['en', 'fr', 'ja', 'ru', 'zh-Hans', 'zh-Hant']) {
      const agentLocale = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'localization', 'locales', locale, 'agent.json'), 'utf8'),
      ) as { Preference?: Record<string, unknown> };
      expect(agentLocale.Preference?.ProviderIdInvalid, locale).toEqual(expect.stringContaining('{{maxBytes}}'));
    }
  });
});
