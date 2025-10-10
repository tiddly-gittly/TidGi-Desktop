import { StateCreator } from 'zustand';
import { TabCloseDirection, TabsState } from '../types';

/**
 * Middleware for closing multiple tabs
 */
export const closeTabsActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'closeTabs'>
> = (set, _get) => ({
  /**
   * Close multiple tabs
   * @param direction Direction to close tabs: above, below, or other
   * @param fromTabId Reference tab ID
   */
  closeTabs: async (direction: TabCloseDirection, fromTabId: string) => {
    try {
      // Call backend service to close tabs
      await window.service.agentBrowser.closeTabs(direction, fromTabId);

      // Update local state
      const tabs = await window.service.agentBrowser.getAllTabs();
      const activeTabId = await window.service.agentBrowser.getActiveTabId();
      const closedTabs = await window.service.agentBrowser.getClosedTabs();

      set({
        tabs,
        activeTabId,
        closedTabs,
      });
    } catch (error) {
      console.error('Failed to close tabs:', error);
    }
  },
});
