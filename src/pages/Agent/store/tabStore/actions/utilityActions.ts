import { StateCreator } from 'zustand';
import { TabsState } from '../types';

/**
 * Tab utility functions middleware
 */
export const utilityActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'getTabIndex'>
> = (_set, get) => ({
  // Get the index of a tab in the list
  getTabIndex: (tabId: string) => {
    const state = get();
    return state.tabs.findIndex(tab => tab.id === tabId);
  },
});
