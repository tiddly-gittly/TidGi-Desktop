/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { StoreApi } from 'zustand/vanilla';
import type { UIEffectsContext } from '../types/UIEffectsContext';
import type { UIStoreState } from './store';

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
 */
export const createUIEffectsContext = (uiStore: StoreApi<UIStoreState>): UIEffectsContext => {
  const uiEffectsContext: UIEffectsContext = {
    ...uiStore.getState(),
    onSubmit: async (uiElementID: string) => {
      return await new Promise((resolve) => {
        // Watch for submission of this field
        const unsubscribe = uiStore.subscribe(
          (state) => {
            const element = state.elements?.[uiElementID];
            if (element?.isSubmitted) {
              resolve(element.content);
              unsubscribe();
            }
          },
        );
      });
    },
  };
  return uiEffectsContext;
};
