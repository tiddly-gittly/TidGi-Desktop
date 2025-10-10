import { TabState } from '@/pages/Agent/types/tab';
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
> = (set, get) => ({
  /**
   * Initialize the tab store by loading data from the backend service
   * This should be called when the application starts
   */
  initialize: async () => {
    try {
      // Clean up old subscription if it exists
      const state = get();
      if (state._tabsSubscription$) {
        state._tabsSubscription$.unsubscribe();
      }

      // Get closed tabs
      const closedTabs = await window.service.agentBrowser.getClosedTabs();

      // Initialize tabs and subscribe to tabs$ stream for real-time updates
      await window.service.agentBrowser.updateTabsObservable();
      const tabs = await window.service.agentBrowser.getAllTabs();
      const activeTab = tabs.find(tab => tab.state === TabState.ACTIVE);

      // Create subscription to tabs$ stream
      const tabsSubscription$ = window.observables.agentBrowser.tabs$.subscribe(tabs => {
        const activeTab = tabs.find(tab => tab.state === TabState.ACTIVE);

        set({
          tabs,
          activeTabId: activeTab?.id || null,
        });
      });

      // Update store state
      set({
        tabs,
        activeTabId: activeTab?.id || null,
        closedTabs,
        _tabsSubscription$: tabsSubscription$,
      });
    } catch (error) {
      console.error('Failed to initialize tab store:', error);

      // Set empty state on initialization failure to prevent UI errors
      set({
        tabs: [],
        activeTabId: null,
        closedTabs: [],
      });
    }
  },
});
