import type { GenericSettingItemDefinition, IGenericSectionDefinition } from '@services/preferences/definitions/types';
import { appearanceSection } from './appearance';
import { miscSection } from './misc';
import { saveAndSyncSection } from './saveAndSync';
import { serverSection } from './server';
import { subWikiSection } from './subWiki';

/**
 * Ordered list of all workspace settings sections. Display order matches array order.
 * Same architecture as src/services/preferences/definitions/registry.ts
 */
export const allWorkspaceSections: IGenericSectionDefinition[] = [
  appearanceSection,
  saveAndSyncSection,
  serverSection,
  subWikiSection,
  miscSection,
];

export const workspaceSectionById = new Map(allWorkspaceSections.map((s) => [s.id, s]));

function isKeyedItem(item: GenericSettingItemDefinition): item is GenericSettingItemDefinition & { key: string } {
  return 'key' in item && item.type.startsWith('preference-');
}

export function getAllWorkspaceSettingItems() {
  const items: Array<GenericSettingItemDefinition & { key: string }> = [];
  for (const section of allWorkspaceSections) {
    for (const item of section.items) {
      if (isKeyedItem(item)) {
        items.push(item);
      }
    }
  }
  return items;
}
