import { StateCreator } from 'zustand';
import { MAX_CLOSED_TABS, TabsState } from '../types';

/**
 * History actions middleware
 * Handles closed tabs history
 */
export const historyActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'restoreClosedTab' | 'hasClosedTabs'>
> = (set, _get) => ({
  // Check if there are closed tabs available
  hasClosedTabs: () => {
    // Simply check if we have any closed tabs in the state
    return _get().closedTabs.length > 0;
  },

  // Restore a closed tab
  restoreClosedTab: async () => {
    try {
      // Restore the tab through the service
      const restoredTab = await window.service.agentBrowser.restoreClosedTab();

      if (restoredTab) {
        // Refresh the state with updated tabs and closed tabs
        const tabs = await window.service.agentBrowser.getAllTabs();
        const closedTabs = await window.service.agentBrowser.getClosedTabs(MAX_CLOSED_TABS);

        set({
          tabs,
          activeTabId: restoredTab.id,
          closedTabs,
        });
      }
    } catch (error) {
      console.error('Failed to restore closed tab:', error);
    }
  },
});
