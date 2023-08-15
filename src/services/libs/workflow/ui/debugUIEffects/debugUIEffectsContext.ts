/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { UIEffectsContext } from '../types/UIEffectsContext';

export type IUIEffect = (...payloads: unknown[]) => void;
export interface IUIEffectPlugin {
  /**
   * Return what you want to add to the UIEffectsContext
   * @returns An object contains many ui effect methods.
   */
  provideUIEffects: () => Record<string, IUIEffect>;
}

/**
 * This is a global object that contains all UI effects.
 * Methods should be injected by plugins.
 */
export const debugUIEffectsContext = {} as unknown as UIEffectsContext;
/**
 * Add new UI effects to the debug UI effects context.
 */
export function installPlugin(plugin: IUIEffectPlugin) {
  const uiEffectsToAdd = plugin?.provideUIEffects?.();
  if (uiEffectsToAdd && Object.keys(uiEffectsToAdd).length > 0) {
    Object.assign(debugUIEffectsContext, uiEffectsToAdd);
  }
}
