import { StateCreator } from 'zustand';
import { TabsState } from '../types';

/**
 * Split view operations middleware
 */
export const splitViewActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'addToSplitView' | 'removeFromSplitView' | 'clearSplitView' | 'updateSplitRatio'>
> = (set) => ({
  // Add to split view
  addToSplitView: (tabId: string) => {
    set(state => {
      // Maximum of two tabs can be displayed side by side
      if (state.splitViewIds.includes(tabId) || state.splitViewIds.length >= 2) {
        return state;
      }

      return {
        splitViewIds: [...state.splitViewIds, tabId],
      };
    });
  },

  // Remove from split view
  removeFromSplitView: (tabId: string) => {
    set(state => ({
      splitViewIds: state.splitViewIds.filter(id => id !== tabId),
    }));
  },

  // Clear split view
  clearSplitView: () => {
    set(() => ({
      splitViewIds: [],
    }));
  },

  // Update split ratio
  updateSplitRatio: (ratio: number) => {
    set(() => ({
      splitRatio: Math.max(20, Math.min(80, ratio)),
    }));
  },
});
