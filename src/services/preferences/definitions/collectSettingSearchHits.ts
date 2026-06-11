import i18next from 'i18next';

import type { HiddenCondition } from './conditions';
import type { PlatformCondition } from './types';

/** Return the English translation for a key — used for search matching independent of UI language. */
export function txEnForSearch(key: string, ns?: string): string {
  try {
    return (ns ? i18next.t(key, { lng: 'en', ns }) : i18next.t(key, { lng: 'en' })) ?? '';
  } catch {
    return '';
  }
}

export function matchesPlatformForSearch(condition: PlatformCondition | undefined, platform: string | undefined): boolean {
  if (condition === undefined || platform === undefined) return true;
  if (condition === 'darwin') return platform === 'darwin';
  if (condition === '!darwin') return platform !== 'darwin';
  if (condition === 'win32') return platform === 'win32';
  return true;
}

export interface ISettingSearchContext {
  platform?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export interface ISettingSearchSection {
  hidden?: HiddenCondition;
  items: readonly ISettingSearchItem[];
  ns?: string;
  titleKey: string;
}

export interface ISettingSearchItem {
  descriptionKey?: string;
  hidden?: HiddenCondition;
  ns?: string;
  platform?: PlatformCondition;
  titleKey?: string;
  type: string;
}

export function itemMatchesSettingSearchQuery(
  item: ISettingSearchItem,
  section: ISettingSearchSection,
  normalizedQuery: string,
  context: ISettingSearchContext,
): boolean {
  if (item.type === 'divider') return false;
  if (item.platform !== undefined && !matchesPlatformForSearch(item.platform, context.platform)) return false;
  if (!item.titleKey) return false;

  const titleEn = txEnForSearch(item.titleKey, item.ns).toLowerCase();
  const titleCurrent = context.t(item.titleKey, item.ns ? { ns: item.ns } : undefined).toLowerCase();
  const descEn = item.descriptionKey ? txEnForSearch(item.descriptionKey, item.ns).toLowerCase() : '';
  const descCurrent = item.descriptionKey
    ? context.t(item.descriptionKey, item.ns ? { ns: item.ns } : undefined).toLowerCase()
    : '';
  const titleKeyLower = item.titleKey.toLowerCase();
  const descKeyLower = item.descriptionKey?.toLowerCase() ?? '';
  const sectionTitleEn = txEnForSearch(section.titleKey, section.ns).toLowerCase();
  const sectionTitleCurrent = context.t(section.titleKey, section.ns ? { ns: section.ns } : undefined).toLowerCase();
  const sectionKeyLower = section.titleKey.toLowerCase();

  return (
    titleEn.includes(normalizedQuery) ||
    titleCurrent.includes(normalizedQuery) ||
    descEn.includes(normalizedQuery) ||
    descCurrent.includes(normalizedQuery) ||
    titleKeyLower.includes(normalizedQuery) ||
    descKeyLower.includes(normalizedQuery) ||
    sectionTitleEn.includes(normalizedQuery) ||
    sectionTitleCurrent.includes(normalizedQuery) ||
    sectionKeyLower.includes(normalizedQuery)
  );
}

export function collectSettingSearchHits(
  sections: ReadonlyArray<ISettingSearchSection>,
  query: string,
  context: ISettingSearchContext,
  options?: {
    shouldSkipItem?: (item: ISettingSearchItem, section: ISettingSearchSection) => boolean;
    shouldSkipSection?: (section: ISettingSearchSection) => boolean;
  },
): Array<{ item: ISettingSearchItem & { titleKey: string }; section: ISettingSearchSection }> {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const hits: Array<{ item: ISettingSearchItem & { titleKey: string }; section: ISettingSearchSection }> = [];
  for (const section of sections) {
    if (options?.shouldSkipSection?.(section)) continue;
    for (const item of section.items) {
      if (options?.shouldSkipItem?.(item, section)) continue;
      if (itemMatchesSettingSearchQuery(item, section, normalizedQuery, context)) {
        hits.push({ item: item as ISettingSearchItem & { titleKey: string }, section });
      }
    }
  }
  return hits;
}
