import i18next from 'i18next';
import { nanoid } from 'nanoid';
import { StateCreator } from 'zustand';
import { IChatTab, ICreateNewAgentTab, IEditAgentDefinitionTab, INewTab, ISplitViewTab, IWebTab, IWikiEmbedTab, TabItem, TabState, TabType } from '../../../types/tab';
import { TabsState } from '../types';

/**
 * Create basic tab operations - helper function implementation
 * Used both directly by main middleware and as a standalone function
 */
export const createBasicActions = (): Pick<
  TabsState,
  'addTab' | 'closeTab' | 'setActiveTab' | 'pinTab' | 'updateTabData' | 'transformTabType'
> => ({
  // Add new tab
  addTab: async (tabType: TabType, initialData = {}) => {
    const timestamp = Date.now();
    const dataWithoutPosition = { ...initialData };
    delete dataWithoutPosition.insertPosition;

    let newTab: TabItem;

    const tabBase = {
      id: nanoid(),
      state: TabState.ACTIVE,
      isPinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...dataWithoutPosition,
    };

    // For chat tab type, we need to create an agent instance first
    if (tabType === TabType.CHAT) {
      const chatData = dataWithoutPosition as Partial<IChatTab>;
      const agent = await window.service.agentInstance.createAgent(
        chatData.agentDefId,
      );
      newTab = {
        ...tabBase,
        type: TabType.CHAT,
        title: dataWithoutPosition.title || agent.name,
        agentDefId: agent.agentDefId,
        agentId: agent.id,
        initialMessage: chatData.initialMessage,
      } as IChatTab;
      // If there's an initial message, send it to the agent after creation
      if (chatData.initialMessage && agent.id) {
        // Use setTimeout to ensure the tab is fully created before sending message
        setTimeout(() => {
          void window.service.agentInstance.sendMsgToAgent(agent.id, { text: chatData.initialMessage! });
        }, 100);
      }
    } else if (tabType === TabType.CREATE_NEW_AGENT) {
      newTab = {
        ...tabBase,
        type: TabType.CREATE_NEW_AGENT,
        title: dataWithoutPosition.title || i18next.t('Tab.Title.CreateNewAgent'),
        currentStep: (dataWithoutPosition as Partial<ICreateNewAgentTab>).currentStep || 0,
        templateAgentDefId: (dataWithoutPosition as Partial<ICreateNewAgentTab>).templateAgentDefId,
        agentDefId: (dataWithoutPosition as Partial<ICreateNewAgentTab>).agentDefId,
      } as ICreateNewAgentTab;
    } else if (tabType === TabType.EDIT_AGENT_DEFINITION) {
      newTab = {
        ...tabBase,
        type: TabType.EDIT_AGENT_DEFINITION,
        title: dataWithoutPosition.title || i18next.t('Tab.Title.EditAgentDefinition'),
        agentDefId: (dataWithoutPosition as Partial<IEditAgentDefinitionTab>).agentDefId!,
        currentStep: (dataWithoutPosition as Partial<IEditAgentDefinitionTab>).currentStep || 0,
      } as IEditAgentDefinitionTab;
    } else if (tabType === TabType.WEB) {
      newTab = {
        ...tabBase,
        type: TabType.WEB,
        title: dataWithoutPosition.title || i18next.t('Tab.Title.NewWeb'),
        url: (dataWithoutPosition as Partial<IWebTab>).url || 'about:blank',
      } as IWebTab;
    } else if (tabType === TabType.SPLIT_VIEW) {
      // Properly handle SPLIT_VIEW type
      const splitViewData = dataWithoutPosition as Partial<ISplitViewTab>;
      newTab = {
        ...tabBase,
        type: TabType.SPLIT_VIEW,
        title: dataWithoutPosition.title || i18next.t('Tab.Title.SplitView'),
        childTabs: splitViewData.childTabs ? [...splitViewData.childTabs] : [],
        splitRatio: splitViewData.splitRatio ?? 50,
      } as ISplitViewTab;
    } else if (tabType === TabType.WIKI_EMBED) {
      // Handle WIKI_EMBED type for embedding wiki BrowserView in split view
      const wikiEmbedData = dataWithoutPosition as Partial<IWikiEmbedTab>;
      newTab = {
        ...tabBase,
        type: TabType.WIKI_EMBED,
        title: dataWithoutPosition.title || i18next.t('Tab.Title.WikiEmbed'),
        workspaceId: wikiEmbedData.workspaceId || '',
      } as IWikiEmbedTab;
    } else {
      newTab = {
        ...tabBase,
        type: TabType.NEW_TAB,
        title: dataWithoutPosition.title || i18next.t('Tab.Title.NewTab'),
        favorites: (dataWithoutPosition as Partial<INewTab>).favorites
          ? [...(dataWithoutPosition as Partial<INewTab>).favorites!]
          : [],
      } as INewTab;
    }

    return newTab;
  },

  // Close tab
  closeTab: async (tabId) => {
    try {
      await window.service.agentBrowser.closeTab(tabId);
      return true;
    } catch (error) {
      console.error('Failed to close tab:', error);
      return false;
    }
  },

  // Set active tab
  setActiveTab: async (tabId) => {
    try {
      await window.service.agentBrowser.setActiveTab(tabId);
      return true;
    } catch (error) {
      console.error('Failed to set active tab:', error);
      return false;
    }
  },

  // Pin/unpin tab
  pinTab: async (tabId, isPinned) => {
    try {
      await window.service.agentBrowser.pinTab(tabId, isPinned);
      return true;
    } catch (error) {
      console.error('Failed to pin/unpin tab:', error);
      return false;
    }
  },

  // Update tab data
  updateTabData: async (tabId, data) => {
    try {
      await window.service.agentBrowser.updateTab(tabId, data);
      return true;
    } catch (error) {
      console.error('Failed to update tab data:', error);
      return false;
    }
  },

  // Transform tab type
  transformTabType: async (tabId, newType, initialData = {}) => {
    try {
      // First check if tab exists and get its current data
      const tabs = await window.service.agentBrowser.getAllTabs();
      const oldTab = tabs.find(tab => tab.id === tabId);
      if (!oldTab) {
        console.error('Tab not found for transformation:', tabId);
        return false;
      }

      // If converting to CHAT type, need to create an agent first
      if (newType === TabType.CHAT) {
        const agent = await window.service.agentInstance.createAgent(initialData.agentDefId as string);
        initialData = {
          ...initialData,
          agentId: agent.id,
          agentDefId: agent.agentDefId,
          title: initialData.title || agent.name,
        };
      }

      // Create base properties for the new tab
      const baseProps = {
        id: oldTab.id,
        state: oldTab.state,
        isPinned: oldTab.isPinned,
        type: newType,
      };

      // Add specific properties based on tab type
      let newTabData: Partial<TabItem>;
      if (newType === TabType.WEB) {
        newTabData = {
          ...baseProps,
          title: initialData.title as string || 'agent.tabTitle.newWeb',
          url: initialData.url as string || 'about:blank',
        };
      } else if (newType === TabType.CHAT) {
        newTabData = {
          ...baseProps,
          title: initialData.title as string || 'agent.tabTitle.newChat',
          agentId: initialData.agentId as string,
          agentDefId: initialData.agentDefinitionId as string,
        };
      } else if (newType === TabType.SPLIT_VIEW) {
        const childTabsData = initialData.childTabs as TabItem[] | undefined;
        const splitRatioValue = initialData.splitRatio as number | undefined;

        newTabData = {
          ...baseProps,
          title: initialData.title as string || 'agent.tabTitle.splitView',
          childTabs: childTabsData ?? [],
          splitRatio: splitRatioValue ?? 50,
        };
      } else if (newType === TabType.CREATE_NEW_AGENT) {
        newTabData = {
          ...baseProps,
          title: initialData.title as string || 'agent.tabTitle.createNewAgent',
          currentStep: (initialData.currentStep as number) || 1,
          templateAgentDefId: initialData.templateAgentDefId as string,
          agentDefId: initialData.agentDefinitionId as string,
        };
      } else if (newType === TabType.EDIT_AGENT_DEFINITION) {
        newTabData = {
          ...baseProps,
          title: initialData.title as string || 'agent.tabTitle.editAgentDefinition',
          agentDefId: initialData.agentDefinitionId as string,
          currentStep: (initialData.currentStep as number) || 1,
        };
      } else {
        // Default to NEW_TAB
        const favoritesData = initialData.favorites as Array<{
          id: string;
          title: string;
          url: string;
          favicon?: string;
        }>;

        newTabData = {
          ...baseProps,
          title: initialData.title as string || 'agent.tabTitle.newTab',
          favorites: favoritesData ? [...favoritesData] : [],
        };
      }

      // Update the tab in the backend
      await window.service.agentBrowser.updateTab(tabId, newTabData);
      return true;
    } catch (error) {
      console.error('Failed to transform tab type:', error);
      return false;
    }
  },
});

/**
 * Tab basic operations middleware
 */
export const basicActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'addTab' | 'closeTab' | 'setActiveTab' | 'pinTab' | 'updateTabData' | 'transformTabType'>
> = (set, _get) => {
  // Create a single instance of basicActions for reuse
  const basicActions = createBasicActions();

  return {
    // Add new tab
    addTab: async (tabType: TabType, initialData = {}) => {
      void window.service.native.log('debug', 'addTab called with:', { tabType, initialData });
      // First create the tab using the existing function
      const newTab = await basicActions.addTab(tabType, initialData);
      void window.service.native.log('debug', 'New tab created:', { newTab });
      const { insertPosition } = initialData;

      try {
        // Save to the backend service
        void window.service.native.log('debug', 'Saving tab to backend...');
        await window.service.agentBrowser.addTab(newTab, insertPosition);

        // Update the local state by fetching all tabs from backend
        const tabs = await window.service.agentBrowser.getAllTabs();
        const activeTabId = await window.service.agentBrowser.getActiveTabId();
        void window.service.native.log('debug', 'Tab added successfully. Active tab:', { activeTabId });

        set({
          tabs,
          activeTabId,
        });
      } catch (error) {
        void window.service.native.log('error', 'Failed to add tab:', { error });
        console.error('Failed to add tab:', error);
      }

      return newTab;
    },

    // Close tab
    closeTab: async (tabId: string) => {
      try {
        // Close tab in backend first
        await window.service.agentBrowser.closeTab(tabId);

        // Update local state by fetching from backend
        const tabs = await window.service.agentBrowser.getAllTabs();
        const activeTabId = await window.service.agentBrowser.getActiveTabId();
        const closedTabs = await window.service.agentBrowser.getClosedTabs();

        // Update state with new data
        set(() => ({
          tabs,
          activeTabId,
          closedTabs,
        }));
      } catch (error) {
        console.error('Failed to close tab:', error);
      }
    },

    // Set active tab
    setActiveTab: async (tabId: string) => {
      try {
        // Set active tab in backend
        await window.service.agentBrowser.setActiveTab(tabId);

        // Update local state by fetching from backend
        const tabs = await window.service.agentBrowser.getAllTabs();

        set({
          tabs,
          activeTabId: tabId,
        });
      } catch (error) {
        console.error('Failed to set active tab:', error);
      }
    },

    // Pin/unpin tab
    pinTab: async (tabId: string, isPinned: boolean) => {
      try {
        // Pin/unpin tab in backend
        await window.service.agentBrowser.pinTab(tabId, isPinned);

        // Update local state by fetching from backend
        const tabs = await window.service.agentBrowser.getAllTabs();

        set({
          tabs,
        });
      } catch (error) {
        console.error('Failed to pin/unpin tab:', error);
      }
    },

    // Update tab data
    updateTabData: async (tabId: string, data: Partial<TabItem>) => {
      try {
        // Update tab in backend
        await window.service.agentBrowser.updateTab(tabId, data);

        // Update local state by fetching from backend
        const tabs = await window.service.agentBrowser.getAllTabs();

        set({
          tabs,
        });
      } catch (error) {
        console.error('Failed to update tab data:', error);
      }
    },

    // Transform tab type
    transformTabType: async (tabId: string, newType: TabType, initialData: Record<string, unknown> = {}) => {
      try {
        // Call the implementation directly rather than through basicActions
        // First check if tab exists and get its current data
        const tabs = await window.service.agentBrowser.getAllTabs();
        const oldTab = tabs.find(tab => tab.id === tabId);

        if (!oldTab) {
          console.error('Tab not found for transformation:', tabId);
          return;
        }

        // If converting to CHAT type, need to create an agent first
        if (newType === TabType.CHAT) {
          const agent = await window.service.agentInstance.createAgent(initialData.agentDefId as string);
          initialData = {
            ...initialData,
            agentId: agent.id,
            agentDefId: agent.agentDefId,
            title: initialData.title || agent.name,
          };
        }

        // Create base properties for the new tab
        const baseProps = {
          id: oldTab.id,
          state: oldTab.state,
          isPinned: oldTab.isPinned,
          type: newType,
        };

        // Add specific properties based on tab type
        let newTabData: Partial<TabItem>;

        if (newType === TabType.WEB) {
          const titleValue = initialData.title as string || 'agent.tabTitle.newWeb';
          const urlValue = initialData.url as string || 'about:blank';

          newTabData = {
            ...baseProps,
            title: titleValue,
            url: urlValue,
          };
        } else if (newType === TabType.CHAT) {
          const titleValue = initialData.title as string || 'agent.tabTitle.newChat';
          const agentIdValue = initialData.agentId as string;

          const agentDefinitionIdValue = initialData.agentDefId as string;

          newTabData = {
            ...baseProps,
            title: titleValue,
            agentId: agentIdValue,
            agentDefId: agentDefinitionIdValue,
          };
        } else if (newType === TabType.SPLIT_VIEW) {
          const titleValue = initialData.title as string || 'agent.tabTitle.splitView';
          const childTabsValue = initialData.childTabs as TabItem[] | undefined;
          const splitRatioValue = initialData.splitRatio as number | undefined;

          newTabData = {
            ...baseProps,
            title: titleValue,
            childTabs: childTabsValue ?? [],
            splitRatio: splitRatioValue ?? 50,
          };
        } else if (newType === TabType.CREATE_NEW_AGENT) {
          const titleValue = initialData.title as string || 'agent.tabTitle.createNewAgent';
          const currentStepValue = (initialData.currentStep as number) || 0;
          const templateAgentDefinitionIdValue = initialData.templateAgentDefId as string;
          const agentDefinitionIdValue = initialData.agentDefId as string;

          newTabData = {
            ...baseProps,
            title: titleValue,
            currentStep: currentStepValue,
            templateAgentDefId: templateAgentDefinitionIdValue,
            agentDefId: agentDefinitionIdValue,
          };
        } else if (newType === TabType.EDIT_AGENT_DEFINITION) {
          const titleValue = initialData.title as string || 'agent.tabTitle.editAgentDefinition';
          const currentStepValue = (initialData.currentStep as number) || 0;
          const agentDefinitionIdValue = initialData.agentDefId as string;

          void window.service.native.log('info', 'Creating EDIT_AGENT_DEFINITION tab', {
            titleValue,
            currentStepValue,
            agentDefinitionIdValue,
            initialData,
          });

          newTabData = {
            ...baseProps,
            title: titleValue,
            currentStep: currentStepValue,
            agentDefId: agentDefinitionIdValue,
          };
        } else {
          // Default to NEW_TAB
          const titleValue = initialData.title as string || 'agent.tabTitle.newTab';
          const favoritesValue = initialData.favorites as
            | Array<{
              id: string;
              title: string;
              url: string;
              favicon?: string;
            }>
            | undefined;

          newTabData = {
            ...baseProps,
            title: titleValue,
            favorites: favoritesValue ? [...favoritesValue] : [],
          };
        }

        // Update the tab in the backend
        await window.service.agentBrowser.updateTab(tabId, newTabData);

        // Update local state by fetching from backend
        const updatedTabs = await window.service.agentBrowser.getAllTabs();

        set({
          tabs: updatedTabs,
        });
      } catch (error) {
        console.error('Failed to transform tab type:', error);
      }
    },
  };
};
