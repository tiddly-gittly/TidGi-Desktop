/**
 * Registry for workspace custom item components — same pattern as Preferences customComponentRegistry.
 * Section definitions reference components by string ID; the UI layer registers actual React components here.
 */
import type { ICustomItemProps } from '@services/preferences/definitions/types';

const registry = new Map<string, React.ComponentType<ICustomItemProps>>();

export function registerWorkspaceCustomComponent(id: string, component: React.ComponentType<ICustomItemProps>): void {
  registry.set(id, component);
}

export function getCustomComponent(id: string): React.ComponentType<ICustomItemProps> | undefined {
  return registry.get(id);
}
