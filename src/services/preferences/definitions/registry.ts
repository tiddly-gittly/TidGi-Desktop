import type { HunspellLanguages } from '@/constants/hunspellLanguages';
import { z } from 'zod';
import { aiAgentSection } from './aiAgent';
import { developersSection } from './developers';
import { downloadsSection } from './downloads';
import { externalAPISection } from './externalAPI';
import { friendLinksSection } from './friendLinks';
import { generalSection } from './general';
import { languagesSection } from './languages';
import { miscSection } from './misc';
import { networkSection } from './network';
import { notificationsSection } from './notifications';
import { performanceSection } from './performance';
import { privacySection } from './privacy';
import { searchSection } from './search';
import { syncSection } from './sync';
import { systemSection } from './system';
import { tidgiMiniWindowSection } from './tidgiMiniWindow';
import type {
  IBooleanPreferenceItem,
  IEnumPreferenceItem,
  INumberPreferenceItem,
  ISectionDefinition,
  IStringArrayPreferenceItem,
  IStringPreferenceItem,
  PreferenceItemDefinition,
} from './types';
import { updatesSection } from './updates';
import { wikiSection } from './wiki';

/**
 * Ordered list of all sections. Display order matches array order.
 */
export const allSections: ISectionDefinition[] = [
  wikiSection,
  generalSection,
  tidgiMiniWindowSection,
  syncSection,
  externalAPISection,
  aiAgentSection,
  searchSection,
  notificationsSection,
  systemSection,
  languagesSection,
  developersSection,
  downloadsSection,
  networkSection,
  privacySection,
  performanceSection,
  updatesSection,
  friendLinksSection,
  miscSection,
];

/** Map from section ID to its definition */
export const sectionById = new Map<string, ISectionDefinition>(allSections.map((s) => [s.id, s]));

/**
 * Type guard: is this a preference-backed item (has a `key`)?
 */
export type PreferenceItem = IBooleanPreferenceItem | IEnumPreferenceItem | INumberPreferenceItem | IStringPreferenceItem | IStringArrayPreferenceItem;

export function isPreferenceItem(item: PreferenceItemDefinition): item is PreferenceItem {
  return item.type.startsWith('preference-');
}

/**
 * Collect all preference keys declared across all sections.
 * Used to build the Zod schema and for search.
 */
export function getAllPreferenceItems(): PreferenceItem[] {
  const items: PreferenceItem[] = [];
  for (const section of allSections) {
    for (const item of section.items) {
      if (isPreferenceItem(item)) {
        items.push(item);
      }
    }
  }
  return items;
}

/**
 * Build the unified Zod schema from all section definitions.
 * Fields not covered by definitions (like keyboardShortcuts, spellcheckLanguages)
 * are added here as extra fields.
 */
export function buildZodSchema(): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const item of getAllPreferenceItems()) {
    shape[item.key] = item.zod;
  }
  // Extra fields not managed by section definitions but part of IPreferences
  shape.keyboardShortcuts = z.record(z.string(), z.string());
  shape.spellcheckLanguages = z.array(z.string() as z.ZodType<HunspellLanguages>);
  shape.pauseNotifications = z.string().optional();
  // Schedule fields rendered by custom TimePicker component
  shape.pauseNotificationsBySchedule = z.boolean();
  shape.pauseNotificationsByScheduleFrom = z.string();
  shape.pauseNotificationsByScheduleTo = z.string();
  // Language is managed by a custom selector
  shape.language = z.string();
  return z.object(shape) as z.ZodObject<Record<string, z.ZodType>>;
}

/** The derived Zod schema — replaces the old zodSchema.ts */
export const zodPreferencesSchema = buildZodSchema();
