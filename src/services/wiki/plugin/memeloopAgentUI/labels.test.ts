import { describe, expect, it } from 'vitest';
import { formatTimelineTurn, getWikiAgentLabels, resolveWikiAgentLocale, supportedWikiAgentLocales } from './labels';

describe('formatTimelineTurn', () => {
  it('uses the one-based index supplied by the shared timeline rail without incrementing it again', () => {
    expect(formatTimelineTurn(1, 5, 'en')).toBe('Turn 1 of 5');
    expect(formatTimelineTurn(5, 5, 'zh-Hans')).toBe('第 5 / 5 轮');
  });

  it('covers all six Desktop locales and falls back to English', () => {
    expect(supportedWikiAgentLocales).toEqual(['en', 'fr', 'ja', 'ru', 'zh-Hans', 'zh-Hant']);
    const englishKeys = Object.keys(getWikiAgentLabels('en')).sort();
    for (const locale of supportedWikiAgentLocales) {
      const labels = getWikiAgentLabels(locale);
      expect(Object.keys(labels).sort()).toEqual(englishKeys);
      expect(Object.values(labels)).not.toContain('');
      expect(labels.compacted(12)).toContain('12');
      expect(labels.newMessages(3)).toContain('3');
      expect(labels.moreResponses(4)).toContain('4');
      expect(labels.previewMessageCount(7)).toContain('7');
      expect(labels.previewCompactionCount(2)).toContain('2');
      expect(labels.configErrorMessage('provider_key_missing')).toContain('provider_key_missing');
      expect(labels.runOnTarget('Peer A')).toContain('Peer A');
      expect(labels.targetConfirmDescription('Peer A')).toContain('Peer A');
    }
    expect(getWikiAgentLabels('en').moreResponses(1)).toBe('1 more response in this turn');
    expect(getWikiAgentLabels('fr').moreResponses(1)).toContain('1 réponse supplémentaire');
    expect(getWikiAgentLabels('ru').moreResponses(1)).toContain('1 ответ ');
    expect(getWikiAgentLabels('ru').moreResponses(3)).toContain('3 ответа ');
    expect(getWikiAgentLabels('ru').moreResponses(12)).toContain('12 ответов ');
    expect(getWikiAgentLabels('en').attachmentLoadFailed).toBe('Attachment preview could not be loaded.');
    expect(getWikiAgentLabels('zh-Hans').attachmentLoadFailed).toBe('无法加载附件预览。');
    expect(getWikiAgentLabels('en').exportFullMessage).toBe('Export full message');
    expect(getWikiAgentLabels('zh-Hans').exportFullMessage).toBe('导出完整消息');
    for (const locale of supportedWikiAgentLocales.filter(locale => locale !== 'en')) {
      expect(getWikiAgentLabels(locale).exportFullMessage, locale).not.toBe(getWikiAgentLabels('en').exportFullMessage);
    }
    expect(resolveWikiAgentLocale('$:/languages/zh-Hant')).toBe('zh-Hant');
    expect(resolveWikiAgentLocale('unknown')).toBe('en');
  });
});
