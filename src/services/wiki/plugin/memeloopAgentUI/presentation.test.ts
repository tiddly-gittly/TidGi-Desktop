import { describe, expect, it } from 'vitest';
import { resolveWikiAgentColorScheme, resolveWikiAgentDirection } from './presentation';

describe('MemeLoop TiddlyWiki presentation', () => {
  it.each(
    [
      ['$:/languages/ar', 'rtl'],
      ['ar-SA', 'rtl'],
      ['fa_IR', 'rtl'],
      ['$:/languages/en-GB', 'ltr'],
      ['zh-Hant', 'ltr'],
    ] as const,
  )('maps %s to %s direction', (locale, direction) => {
    expect(resolveWikiAgentDirection(locale)).toBe(direction);
  });

  it('only opts into dark mode for an explicit dark Wiki palette', () => {
    expect(resolveWikiAgentColorScheme('dark')).toBe('dark');
    expect(resolveWikiAgentColorScheme('Dark')).toBe('dark');
    expect(resolveWikiAgentColorScheme(undefined)).toBe('light');
    expect(resolveWikiAgentColorScheme('unknown')).toBe('light');
  });
});
