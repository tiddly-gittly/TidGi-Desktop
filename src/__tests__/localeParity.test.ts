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
      'AttachmentLoadFailed',
      'DetailLoadFailed',
      'DetailLine',
      'DetailTruncated',
      'Error',
      'ExportFullMessage',
      'HideDetails',
      'LoadDetails',
      'NoDetails',
      'ReloadDetails',
      'ShowDetails',
      'ToolCall',
      'ToolResult',
      'Truncated',
    ];
    const askQuestionKeys = ['AnswerPlaceholder', 'Submit', 'ConfirmSelection', 'Answered'];
    const locales = ['en', 'fr', 'ja', 'ru', 'zh-Hans', 'zh-Hant'];
    type ChatLocale = {
      Chat?: {
        AskQuestion?: Record<string, unknown>;
        ExecutionTarget?: Record<string, unknown>;
        Message?: Record<string, unknown>;
      };
    };
    const readAgentLocale = (locale: string): ChatLocale =>
      JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'localization', 'locales', locale, 'agent.json'), 'utf8'),
      ) as ChatLocale;
    const english = readAgentLocale('en');
    const englishMessageKeys = Object.keys(english.Chat?.Message ?? {}).sort();
    const englishAskQuestionKeys = Object.keys(english.Chat?.AskQuestion ?? {}).sort();

    for (const locale of locales) {
      const agentLocale = readAgentLocale(locale);
      expect(executionTargetKeys.filter(key => !(key in (agentLocale.Chat?.ExecutionTarget ?? {}))), locale).toEqual([]);
      expect(messageKeys.filter(key => !(key in (agentLocale.Chat?.Message ?? {}))), locale).toEqual([]);
      expect(askQuestionKeys.filter(key => !(key in (agentLocale.Chat?.AskQuestion ?? {}))), locale).toEqual([]);
      expect(Object.keys(agentLocale.Chat?.Message ?? {}).sort(), locale).toEqual(englishMessageKeys);
      expect(Object.keys(agentLocale.Chat?.AskQuestion ?? {}).sort(), locale).toEqual(englishAskQuestionKeys);
    }

    const labelsThatMustBeLocalized = [
      'AttachmentLoadFailed',
      'ReloadDetails',
      'DetailTruncated',
      'DetailLoadFailed',
      'ExportFullMessage',
    ];
    for (const locale of locales.filter(locale => locale !== 'en')) {
      const localized = readAgentLocale(locale);
      for (const key of labelsThatMustBeLocalized) {
        expect(localized.Chat?.Message?.[key], `${locale}: Chat.Message.${key}`).not.toBe(english.Chat?.Message?.[key]);
      }
      for (const key of askQuestionKeys) {
        expect(localized.Chat?.AskQuestion?.[key], `${locale}: Chat.AskQuestion.${key}`).not.toBe(english.Chat?.AskQuestion?.[key]);
      }
    }

    expect(english.Chat?.Message).toMatchObject({
      AttachmentLoadFailed: 'Attachment preview could not be loaded.',
      ReloadDetails: 'Reload details',
      DetailTruncated: 'Only a bounded detail fragment is shown. Export the conversation for complete content.',
      DetailLoadFailed: 'Details could not be loaded.',
      ExportFullMessage: 'Export full message',
    });
    expect(english.Chat?.AskQuestion).toEqual({
      AnswerPlaceholder: 'Your answer…',
      Submit: 'Submit',
      ConfirmSelection: 'Confirm selection',
      Answered: 'Answered',
    });
    const simplifiedChinese = readAgentLocale('zh-Hans');
    expect(simplifiedChinese.Chat?.Message).toMatchObject({
      AttachmentLoadFailed: '无法加载附件预览。',
      ReloadDetails: '重新加载详细内容',
      DetailTruncated: '这里只显示有界的详情片段。请导出对话以获取完整内容。',
      DetailLoadFailed: '无法加载详细内容。',
      ExportFullMessage: '导出完整消息',
    });
    expect(simplifiedChinese.Chat?.AskQuestion).toEqual({
      AnswerPlaceholder: '输入回答…',
      Submit: '提交',
      ConfirmSelection: '确认选择',
      Answered: '已回答',
    });
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
