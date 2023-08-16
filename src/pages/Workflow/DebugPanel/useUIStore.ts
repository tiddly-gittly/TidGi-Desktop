import { uiStore, UIStoreState } from '@/pages/Workflow/libs/ui/debugUIEffects/store';
import { useStore } from 'zustand';

export function useUIStore<T>(selector: (state: UIStoreState) => T) {
  return useStore(uiStore, selector);
}
