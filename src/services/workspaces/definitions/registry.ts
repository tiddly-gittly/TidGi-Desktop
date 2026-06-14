import type { GenericSettingItemDefinition, IGenericSectionDefinition } from '@services/preferences/definitions/types';
import { WorkspaceType } from '../interface';
import { appearanceSection } from './appearance';
import { miscSection } from './misc';
import { saveAndSyncSection } from './saveAndSync';
import { searchSection } from './search';
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
  searchSection,
  miscSection,
];

export const workspaceSectionById = new Map(allWorkspaceSections.map((s) => [s.id, s]));

const htmlHiddenSections = new Set(['subWiki', 'search']);

const htmlHiddenPreferenceKeys = new Set([
  'enableFileSystemWatch',
  'syncSubWikis',
]);

const htmlHiddenComponentIds = new Set([
  'workspace.server.lastNodeJSArgv',
  'workspace.server.excludedPlugins',
  'workspace.server.rootTiddler',
  'workspace.server.httpsToggle',
  'workspace.server.httpsCert',
]);

function isKeyedItem(item: GenericSettingItemDefinition): item is GenericSettingItemDefinition & { key: string } {
  return 'key' in item && item.type.startsWith('preference-');
}

function isCustomItem(item: GenericSettingItemDefinition): item is GenericSettingItemDefinition & { componentId: string } {
  return item.type === 'custom' && 'componentId' in item;
}

export function filterWorkspaceSectionForType(section: IGenericSectionDefinition, workspaceType: WorkspaceType): IGenericSectionDefinition {
  if (workspaceType !== WorkspaceType.html) {
    return section;
  }
  if (htmlHiddenSections.has(section.id)) {
    return { ...section, items: [] };
  }
  return {
    ...section,
    items: section.items.filter((item) => {
      if (isKeyedItem(item) && htmlHiddenPreferenceKeys.has(item.key)) {
        return false;
      }
      if (isCustomItem(item) && htmlHiddenComponentIds.has(item.componentId)) {
        return false;
      }
      return true;
    }),
  };
}

export function getWorkspaceSectionsForType(workspaceType: WorkspaceType): IGenericSectionDefinition[] {
  return allWorkspaceSections
    .map((section) => filterWorkspaceSectionForType(section, workspaceType))
    .filter((section) => section.items.length > 0 || section.CustomSectionComponent !== undefined);
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
