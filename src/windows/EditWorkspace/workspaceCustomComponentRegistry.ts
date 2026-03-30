/**
 * Registry for workspace custom item components — same pattern as Preferences customComponentRegistry.
 * Section definitions reference components by string ID; the UI layer registers actual React components here.
 */
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import type { ComponentType } from 'react';

const registry = new Map<string, ComponentType<ICustomItemProps>>();

export function registerWorkspaceCustomComponent(id: string, component: ComponentType<ICustomItemProps>): void {
  registry.set(id, component);
}

export function getCustomComponent(id: string): ComponentType<ICustomItemProps> | undefined {
  return registry.get(id);
}
