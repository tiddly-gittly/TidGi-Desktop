import { StateCreator } from 'zustand';
import { TabsState } from '../types';

/**
 * Initialize tab store actions
 * Loads tabs data from the backend service
 */
export const initializeActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'initialize'>
> = (set) => ({
  /**
   * Initialize the tab store by loading data from the backend service
   * This should be called when the application starts
   */
  initialize: async () => {
    try {
      // Get all tabs
      const tabs = await window.service.agentBrowser.getAllTabs();

      // Get active tab ID
      const activeTabId = await window.service.agentBrowser.getActiveTabId();

      // Get closed tabs
      const closedTabs = await window.service.agentBrowser.getClosedTabs();

      // Update store state
      set({
        tabs,
        activeTabId,
        closedTabs,
      });
    } catch (error) {
      console.error('Failed to initialize tab store:', error);

      // If initialization fails, set empty state to avoid UI errors
      set({
        tabs: [],
        activeTabId: null,
        closedTabs: [],
      });
    }
  },
});
