import { StateCreator } from 'zustand';
import { TEMP_TAB_ID_PREFIX } from '../../../constants/tab';
import { TabType } from '../../../types/tab';
import { TabsState } from '../types';

/**
 * Tab utility functions middleware
 */
export const utilityActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'getTabIndex' | 'createAgentChatTab'>
> = (_set, get) => ({
  // Get the index of a tab in the list
  getTabIndex: (tabId: string) => {
    const state = get();
    return state.tabs.findIndex(tab => tab.id === tabId);
  },

  // Create a new agent chat tab, handling current active tab cleanup
  createAgentChatTab: async (agentDefinitionId?: string) => {
    try {
      const state = get();
      const { activeTabId, tabs, closeTab, addTab } = state;

      // Use default agent if no ID provided
      const agentDefinitionIdToUse = agentDefinitionId || 'example-agent';

      // Handle current active tab - close temp tabs or NEW_TAB type tabs
      if (activeTabId) {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab && (activeTab.id.startsWith(TEMP_TAB_ID_PREFIX) || activeTab.type === TabType.NEW_TAB)) {
          closeTab(activeTabId);
        }
      }

      // Create agent instance
      const agent = await window.service.agentInstance.createAgent(agentDefinitionIdToUse);

      // Create new chat tab
      return await addTab(TabType.CHAT, {
        title: agent.name,
        agentId: agent.id,
        agentDefId: agent.agentDefId,
      });
    } catch (error) {
      console.error('Failed to create agent chat tab:', error);
      throw error;
    }
  },
});
