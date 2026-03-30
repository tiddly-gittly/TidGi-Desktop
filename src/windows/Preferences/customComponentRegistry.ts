/**
 * Registry for custom item components.
 * The service-layer definitions reference components by string ID.
 * The UI layer registers the actual React components here.
 */
import type { ComponentType } from 'react';
import type { ICustomItemProps } from '@services/preferences/definitions/types';

const customComponentRegistry = new Map<string, ComponentType<ICustomItemProps>>();

export function registerCustomComponent(id: string, component: ComponentType<ICustomItemProps>): void {
  customComponentRegistry.set(id, component);
}

export function getCustomComponent(id: string): ComponentType<ICustomItemProps> | undefined {
  return customComponentRegistry.get(id);
}
