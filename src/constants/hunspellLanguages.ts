// language code extracted from session.availableSpellCheckerLanguages: string[]
// languages name from http://www.lingoes.net/en/translator/langcode.htm & Chrome preferences
// sorted by name

export const hunspellLanguagesMap: IHunspellLanguagesMap = {
  af: 'Afrikaans',
  bg: 'Bulgarian - български',
  ca: 'Catalan - català',
  cs: 'Czech - čeština',
  cy: 'Welsh - Cymraeg',
  da: 'Danish - dansk',
  de: 'German - Deutsch',
  el: 'Greek - Ελληνικά',
  'en-AU': 'English (Australia)',
  'en-CA': 'English (Canada)',
  'en-GB': 'English (United Kingdom)',
  'en-US': 'English (United States)',
  es: 'Spanish - español',
  'es-419': 'Spanish (Latin America) - español (América Latina)',
  'es-AR': 'Spanish (Argentina) - español (Argentina)',
  'es-ES': 'Spanish (Spain) - español (España)',
  'es-MX': 'Spanish (Mexico) - español (México)',
  'es-US': 'Spanish (United States) - español (Estados Unidos)',
  et: 'Estonian - eesti',
  fa: 'Persian - ‎‫فارسی‬‎',
  fo: 'Faroese - føroyskt',
  fr: 'French - français',
  he: 'Hebrew - ‎‫עברית‬‎',
  hi: 'Hindi - हिन्दी',
  hr: 'Croatian - hrvatski',
  hu: 'Hungarian - magyar',
  hy: 'Armenian - հայերեն',
  id: 'Indonesian - Indonesia',
  it: 'Italian - italiano',
  ko: 'Korean - 한국어',
  lt: 'Lithuanian - lietuvių',
  lv: 'Latvian - latviešu',
  nb: 'Norwegian Bokmål - norsk bokmål',
  nl: 'Dutch - Nederlands',
  pl: 'Polish - polski',
  'pt-BR': 'Portuguese (Brazil) - português (Brasil)',
  'pt-PT': 'Portuguese (Portugal) - português (Portugal)',
  ro: 'Romanian - română',
  ru: 'Russian - русский',
  sh: 'Serbo-Croatian - srpskohrvatski',
  sk: 'Slovak - slovenčina',
  sl: 'Slovenian - slovenščina',
  sq: 'Albanian - shqip',
  sr: 'Serbian - српски',
  sv: 'Swedish - svenska',
  ta: 'Tamil - தமிழ்',
  tg: 'Tajik - тоҷикӣ',
  tr: 'Turkish - Türkçe',
  uk: 'Ukrainian - українська',
  vi: 'Vietnamese - Tiếng Việt',
};

export interface IHunspellLanguagesMap {
  af: string;
  bg: string;
  ca: string;
  cs: string;
  cy: string;
  da: string;
  de: string;
  el: string;
  'en-AU': string;
  'en-CA': string;
  'en-GB': string;
  'en-US': string;
  es: string;
  'es-419': string;
  'es-AR': string;
  'es-ES': string;
  'es-MX': string;
  'es-US': string;
  et: string;
  fa: string;
  fo: string;
  fr: string;
  he: string;
  hi: string;
  hr: string;
  hu: string;
  hy: string;
  id: string;
  it: string;
  ko: string;
  lt: string;
  lv: string;
  nb: string;
  nl: string;
  pl: string;
  'pt-BR': string;
  'pt-PT': string;
  ro: string;
  ru: string;
  sh: string;
  sk: string;
  sl: string;
  sq: string;
  sr: string;
  sv: string;
  ta: string;
  tg: string;
  tr: string;
  uk: string;
  vi: string;
}
export type HunspellLanguages = keyof IHunspellLanguagesMap;
