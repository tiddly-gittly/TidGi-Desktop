import { UIElementState, uiStore, UIStoreState } from '@services/libs/workflow/ui/debugUIEffects/store';
import { useStore } from 'zustand';
import { plugins } from './plugins';

export function useUIStore<T>(selector: (state: UIStoreState) => T) {
  return useStore(uiStore, selector);
}

export function DebugUIElements() {
  const elements = useUIStore((state) => Object.values(state.elements).filter((element): element is UIElementState => element !== undefined));
  return elements.map(element => {
    const plugin = plugins.find(p => p.type === element.type);
    if (plugin === undefined) {
      // TODO: return a placeholder element instead
      // eslint-disable-next-line unicorn/no-null
      return null;
    }
    const { Component } = plugin;
    return <Component key={element.id} {...element} />;
  });
}
