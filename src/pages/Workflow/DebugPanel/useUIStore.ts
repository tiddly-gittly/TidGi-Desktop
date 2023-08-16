import { uiStore, UIStoreState } from '@services/libs/workflow/ui/debugUIEffects/store';
import { useStore } from 'zustand';

export function useUIStore<T>(selector: (state: UIStoreState) => T) {
  return useStore(uiStore, selector);
}
