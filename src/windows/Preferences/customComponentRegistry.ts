/**
 * Registry for custom item components.
 * The service-layer definitions reference components by string ID.
 * The UI layer registers the actual React components here.
 */
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import type { ComponentType } from 'react';

const customComponentRegistry = new Map<string, ComponentType<ICustomItemProps>>();

export function registerCustomComponent(id: string, component: ComponentType<ICustomItemProps>): void {
  customComponentRegistry.set(id, component);
}

export function getCustomComponent(id: string): ComponentType<ICustomItemProps> | undefined {
  return customComponentRegistry.get(id);
}
