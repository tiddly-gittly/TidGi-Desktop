import { debounce } from 'lodash';
import { nanoid } from 'nanoid';
import { StateCreator } from 'zustand';
import { ISplitViewTab, TabItem, TabState, TabType } from '../../../types/tab';
import { TabsState } from '../types';

/**
 * Split view operations middleware
 */
export const splitViewActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'createSplitViewFromTabs' | 'removeFromSplitView' | 'updateSplitRatio' | 'convertToSplitView' | 'addTabToSplitView'>
> = (set, get) => {
  // Create debounced function to update database
  const debouncedDatabaseUpdate = debounce(
    (tabId: string, boundedRatio: number) => {
      get().updateTabData(tabId, { splitRatio: boundedRatio });
    },
    300,
    { maxWait: 1000 },
  );

  // Helper function to create a deep copy of a tab
  const createTabCopy = (tab: TabItem): TabItem => {
    // Deep clone the tab and assign a new ID
    const tabCopy = JSON.parse(JSON.stringify(tab)) as TabItem;
    tabCopy.id = nanoid();
    return tabCopy;
  };

  return {
    // Create a new split view from two tabs
    createSplitViewFromTabs: async (tabId: string) => {
      const state = get();
      // Find the active tab
      const activeTabId = state.activeTabId;
      if (!activeTabId || activeTabId === tabId) return;

      // Get the active tab and the target tab
      const activeTab = state.tabs.find(tab => tab.id === activeTabId);
      const targetTab = state.tabs.find(tab => tab.id === tabId);
      if (!activeTab || !targetTab) return;

      try {
        // Create a new split view tab
        const timestamp = Date.now();
        const newSplitViewTab: ISplitViewTab = {
          id: nanoid(),
          type: TabType.SPLIT_VIEW,
          title: `${activeTab.title} | ${targetTab.title}`,
          state: TabState.ACTIVE,
          isPinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          childTabs: [activeTab, targetTab], // Original references are fine here because we'll close these tabs
          splitRatio: 50, // Default to 50/50 split
        };

        // Add the new tab directly using the backend service
        await window.service.agentBrowser.addTab(newSplitViewTab);

        // Close the original tabs
        await window.service.agentBrowser.closeTab(activeTabId);
        await window.service.agentBrowser.closeTab(tabId);

        // Set the new split view tab as active
        await window.service.agentBrowser.setActiveTab(newSplitViewTab.id);

        // Update the zustand store with the latest data from the backend
        const updatedTabs = await window.service.agentBrowser.getAllTabs();
        const newActiveId = await window.service.agentBrowser.getActiveTabId();

        set({
          tabs: updatedTabs,
          activeTabId: newActiveId,
        });
      } catch (error) {
        console.error('Failed to create split view tab:', error);
      }
    },

    // Remove from split view
    removeFromSplitView: async (tabId: string) => {
      const state = get();
      // Find the split view tab that contains this tab
      const splitViewTab = state.tabs.find(
        tab => tab.type === TabType.SPLIT_VIEW && (tab).childTabs.some(childTab => childTab.id === tabId),
      ) as ISplitViewTab | undefined;

      if (!splitViewTab) return;

      try {
        // Get the tab to remove
        const tabToRemove = splitViewTab.childTabs.find(tab => tab.id === tabId);
        if (!tabToRemove) return;

        // Get the remaining tabs
        const remainingTabs = splitViewTab.childTabs.filter(tab => tab.id !== tabId);

        // Create a standalone tab for the removed one (but don't activate it)
        const removedTabCopy = createTabCopy(tabToRemove);

        // First, directly update the split view tab in the backend
        await window.service.agentBrowser.updateTab(splitViewTab.id, {
          childTabs: remainingTabs,
          title: remainingTabs.map(tab => tab.title).join(' | '),
        });

        // Add the removed tab as a standalone tab, but don't make it active
        await window.service.agentBrowser.addTab(removedTabCopy);

        // Make sure the split view tab stays active
        await window.service.agentBrowser.setActiveTab(splitViewTab.id);

        // Update the zustand store with the latest data from the backend
        const tabs = await window.service.agentBrowser.getAllTabs();
        const activeTabId = await window.service.agentBrowser.getActiveTabId();

        set({
          tabs,
          activeTabId,
        });
      } catch (error) {
        console.error('Failed to remove tab from split view:', error);
      }
    },

    // Update split ratio - Optimized with immediate UI update and debounced database updates
    updateSplitRatio: async (ratio: number): Promise<void> => {
      const state = get();
      // Find active split view tab
      const activeSplitViewTab = state.tabs.find(
        tab => tab.id === state.activeTabId && tab.type === TabType.SPLIT_VIEW,
      ) as ISplitViewTab | undefined;

      if (activeSplitViewTab) {
        // Calculate the bounded ratio value (between 20 and 80)
        const boundedRatio = Math.max(20, Math.min(80, ratio));

        // Immediately update the UI by modifying the tab in state
        const updatedTabs = state.tabs.map(tab =>
          tab.id === activeSplitViewTab.id
            ? { ...tab, splitRatio: boundedRatio }
            : tab
        );

        // Update the state for immediate UI feedback
        set({ tabs: updatedTabs });

        // Use debounced function for database updates
        debouncedDatabaseUpdate(activeSplitViewTab.id, boundedRatio);
      }

      // Return resolved promise to satisfy interface
      return Promise.resolve();
    },

    // Convert a regular tab to split view tab
    convertToSplitView: async (tabId: string) => {
      const state = get();

      // Get the tab to convert
      const tabToConvert = state.tabs.find(tab => tab.id === tabId);
      if (!tabToConvert) return;
      try {
        // Create a new split view tab containing only the original tab
        const timestamp = Date.now();
        const newSplitViewTab: ISplitViewTab = {
          id: nanoid(),
          type: TabType.SPLIT_VIEW,
          title: tabToConvert.title,
          state: TabState.ACTIVE,
          isPinned: tabToConvert.isPinned,
          createdAt: timestamp,
          updatedAt: timestamp,
          childTabs: [tabToConvert], // Original reference is fine here because we'll close this tab
          splitRatio: 50, // Default to 50/50 split
        };

        // Add the new tab directly using the backend service
        await window.service.agentBrowser.addTab(newSplitViewTab);

        // Close the original tab
        await window.service.agentBrowser.closeTab(tabId);

        // Set the new split view tab as active
        await window.service.agentBrowser.setActiveTab(newSplitViewTab.id);

        // Update the zustand store with the latest data from the backend
        const tabs = await window.service.agentBrowser.getAllTabs();
        const activeTabId = await window.service.agentBrowser.getActiveTabId();

        set({
          tabs,
          activeTabId,
        });
      } catch (error) {
        console.error('Failed to convert tab to split view:', error);
      }
    }, // Add a tab to an existing split view
    addTabToSplitView: async (splitViewTabId: string, tabId: string) => {
      const state = get();

      // Get the split view tab and the tab to add
      const splitViewTab = state.tabs.find(tab => tab.id === splitViewTabId && tab.type === TabType.SPLIT_VIEW) as ISplitViewTab | undefined;
      const tabToAdd = state.tabs.find(tab => tab.id === tabId);

      if (!splitViewTab || !tabToAdd) return;

      // Don't add if already in the split view
      const isAlreadyInSplitView = splitViewTab.childTabs.some(tab => tab.id === tabId);
      if (isAlreadyInSplitView) return;

      try {
        // Create a deep copy of the tab with a new ID
        const tabCopy = createTabCopy(tabToAdd);

        // Maximum of two tabs can be displayed side by side
        const updatedChildTabs = splitViewTab.childTabs.length >= 2
          ? [splitViewTab.childTabs[0], tabCopy] // Replace second tab
          : [...splitViewTab.childTabs, tabCopy]; // Add as new tab

        // First directly call the backend updateTab service to ensure database update
        // This ensures the backend is updated before UI changes
        await window.service.agentBrowser.updateTab(splitViewTabId, {
          childTabs: updatedChildTabs,
          title: updatedChildTabs.map(tab => tab.title).join(' | '),
        });

        // Set this tab as active using the direct backend call
        await window.service.agentBrowser.setActiveTab(splitViewTabId);

        // Close the original tab that was added
        await window.service.agentBrowser.closeTab(tabId);

        // Update the zustand store with the latest data from the backend
        const tabs = await window.service.agentBrowser.getAllTabs();
        const activeTabId = await window.service.agentBrowser.getActiveTabId();

        set({
          tabs,
          activeTabId,
        });
      } catch (error) {
        console.error('Failed to add tab to split view:', error);
      }
    },
  };
};
