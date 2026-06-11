import { z } from 'zod';
import { customPreferenceFieldSchemas } from './customPreferenceFields';
import { aiAgentSection } from './aiAgent';
import { developersSection } from './developers';
import { downloadsSection } from './downloads';
import { externalAPISection } from './externalAPI';
import { generalSection } from './general';
import { languagesSection } from './languages';
import { miscSection } from './misc';
import { networkSection } from './network';
import { notificationsSection } from './notifications';
import { performanceSection } from './performance';
import { privacySection } from './privacy';
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
  ITextPreferenceItem,
  PreferenceItemDefinition,
} from './types';
import { updatesSection } from './updates';
import { wikiSection } from './wiki';
import { workspaceGroupsSection } from './workspaceGroups';

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
  notificationsSection,
  systemSection,
  languagesSection,
  workspaceGroupsSection,
  developersSection,
  downloadsSection,
  networkSection,
  privacySection,
  performanceSection,
  updatesSection,
  miscSection,
];

/** Map from section ID to its definition */
export const sectionById = new Map<string, ISectionDefinition>(allSections.map((s) => [s.id, s]));

/**
 * Type guard: is this a preference-backed item (has a `key`)?
 */
export type PreferenceItem = IBooleanPreferenceItem | IEnumPreferenceItem | INumberPreferenceItem | IStringPreferenceItem | IStringArrayPreferenceItem | ITextPreferenceItem;

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
 * Build the unified Zod schema from section definitions and custom item fields.
 */
export function buildZodSchema(): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const item of getAllPreferenceItems()) {
    shape[item.key] = item.zod;
  }
  for (const [key, fieldSchema] of Object.entries(customPreferenceFieldSchemas)) {
    if (!(key in shape)) {
      shape[key] = fieldSchema;
    }
  }
  return z.object(shape);
}

/** The derived Zod schema — replaces the old zodSchema.ts */
export const zodPreferencesSchema = buildZodSchema();
