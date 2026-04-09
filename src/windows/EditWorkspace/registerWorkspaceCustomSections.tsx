/**
 * Wires custom section components and custom item components to their workspace definitions.
 * Call once at startup (before rendering EditWorkspace) — same pattern as Preferences registerCustomSections.
 */
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { workspaceSectionById } from '@services/workspaces/definitions/registry';
import type { ComponentType } from 'react';
import { WorkspaceAvatarItem, WorkspaceNameItem } from './customItems/AppearanceItems';
import { EmbeddingSection } from './customItems/EmbeddingItem';
import { LastUrlItem } from './customItems/MiscItems';
import { GitRepoUrlItem, StorageServiceSwitchItem, TokenFormItem, WorkspacePathItem } from './customItems/SaveAndSyncItems';
import { ServerOptions } from './server';
import { SubWorkspaceRouting } from './SubWorkspaceRouting';
import { registerWorkspaceCustomComponent } from './workspaceCustomComponentRegistry';

let registered = false;

export function registerWorkspaceCustomSections(): void {
  if (registered) return;
  registered = true;

  // Section-level custom components (entirely custom-rendered sections)
  const registerSection = (sectionId: string, component: ComponentType<ICustomSectionProps>) => {
    const section = workspaceSectionById.get(sectionId);
    if (section) {
      section.CustomSectionComponent = component;
    }
  };
  registerSection('server', ServerOptions);
  registerSection('subWiki', SubWorkspaceRouting);
  registerSection('search', EmbeddingSection);

  // Item-level custom components
  registerWorkspaceCustomComponent('workspace.name', WorkspaceNameItem);
  registerWorkspaceCustomComponent('workspace.avatar', WorkspaceAvatarItem);
  registerWorkspaceCustomComponent('workspace.path', WorkspacePathItem);
  registerWorkspaceCustomComponent('workspace.storageServiceSwitch', StorageServiceSwitchItem);
  registerWorkspaceCustomComponent('workspace.tokenForm', TokenFormItem);
  registerWorkspaceCustomComponent('workspace.gitRepoUrl', GitRepoUrlItem);
  registerWorkspaceCustomComponent('workspace.lastUrl', LastUrlItem);
}
