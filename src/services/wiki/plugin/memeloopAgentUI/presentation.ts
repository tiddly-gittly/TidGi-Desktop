export type WikiAgentDirection = 'ltr' | 'rtl';
export type WikiAgentColorScheme = 'dark' | 'light';

const RTL_LANGUAGES = new Set(['ar', 'dv', 'fa', 'he', 'ku', 'ps', 'sd', 'ug', 'ur', 'yi']);

export function resolveWikiAgentDirection(language: string): WikiAgentDirection {
  const locale = language.replace(/^\$:\/languages\//u, '').toLowerCase();
  const primary = locale.split(/[-_]/u, 1)[0] ?? '';
  return RTL_LANGUAGES.has(primary) ? 'rtl' : 'ltr';
}

export function resolveWikiAgentColorScheme(value: unknown): WikiAgentColorScheme {
  return typeof value === 'string' && value.toLowerCase() === 'dark' ? 'dark' : 'light';
}
