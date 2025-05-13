import { nanoid } from 'nanoid';
import { StateCreator } from 'zustand';
import { IChatTab, INewTab, IWebTab, TabItem, TabState, TabType } from '../../../types/tab';
import { TabsState } from '../types';

/**
 * 创建标签页基础操作
 */
export const createBasicActions = (): Pick<
  TabsState,
  'addTab' | 'closeTab' | 'setActiveTab' | 'pinTab' | 'updateTabData' | 'transformTabType'
> => ({
  // 添加新标签页
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

    // 如果是聊天类型的标签页，需要先创建 agent 实例
    if (tabType === TabType.CHAT) {
      const agent = await window.service.agentInstance.createAgent(
        (dataWithoutPosition as Partial<IChatTab>).agentDefId,
      );
      newTab = {
        ...tabBase,
        type: TabType.CHAT,
        title: dataWithoutPosition.title || agent.name,
        agentDefId: agent.agentDefId,
        agentId: agent.id,
      } as IChatTab;
    } else if (tabType === TabType.WEB) {
      newTab = {
        ...tabBase,
        type: TabType.WEB,
        title: dataWithoutPosition.title || 'agent.tabTitle.newWeb',
        url: (dataWithoutPosition as Partial<IWebTab>).url || 'about:blank',
      } as IWebTab;
    } else {
      newTab = {
        ...tabBase,
        type: TabType.NEW_TAB,
        title: dataWithoutPosition.title || 'agent.tabTitle.newTab',
        favorites: (dataWithoutPosition as Partial<INewTab>).favorites || [],
      } as INewTab;
    }

    return newTab;
  },

  // 关闭标签页
  closeTab: async (tabId) => {
    try {
      await window.service.agentBrowser.closeTab(tabId);
      return true;
    } catch (error) {
      console.error('Failed to close tab:', error);
      return false;
    }
  },

  // 设置激活的标签页
  setActiveTab: async (tabId) => {
    try {
      await window.service.agentBrowser.setActiveTab(tabId);
      return true;
    } catch (error) {
      console.error('Failed to set active tab:', error);
      return false;
    }
  },

  // 固定/取消固定标签页
  pinTab: async (tabId, isPinned) => {
    try {
      await window.service.agentBrowser.pinTab(tabId, isPinned);
      return true;
    } catch (error) {
      console.error('Failed to pin/unpin tab:', error);
      return false;
    }
  },

  // 更新标签页数据
  updateTabData: async (tabId, data) => {
    try {
      await window.service.agentBrowser.updateTab(tabId, data);
      return true;
    } catch (error) {
      console.error('Failed to update tab data:', error);
      return false;
    }
  },

  // 转换标签页类型
  transformTabType: async (tabId, newType, initialData = {}) => {
    try {
      // 获取现有标签
      const tabs = await window.service.agentBrowser.getAllTabs();
      const oldTab = tabs.find(tab => tab.id === tabId);
      if (!oldTab) {
        console.error('Tab not found for transformation:', tabId);
        return false;
      }

      // 如果转换为聊天标签，需要创建 agent
      if (newType === TabType.CHAT) {
        const agent = await window.service.agentInstance.createAgent(initialData.agentDefId as string);
        initialData = {
          ...initialData,
          agentId: agent.id,
          agentDefId: agent.agentDefId,
          title: initialData.title || agent.name,
        };
      }

      // 创建新标签的基础属性
      const baseProps = {
        id: oldTab.id,
        state: oldTab.state,
        isPinned: oldTab.isPinned,
        type: newType,
      };

      // 根据类型添加特定属性
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
          agentDefId: initialData.agentDefId as string,
        };
      } else {
        newTabData = {
          ...baseProps,
          title: initialData.title as string || 'agent.tabTitle.newTab',
          favorites: initialData.favorites as Array<{
            id: string;
            title: string;
            url: string;
            favicon?: string;
          }> || [],
        };
      }

      // 更新标签
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
> = (set, _get) => ({
  // Add new tab
  addTab: async (tabType: TabType, initialData = {}) => {
    // First create the tab using the existing function
    const newTab = await createBasicActions().addTab(tabType, initialData);
    const { insertPosition } = initialData;

    try {
      // Save to the backend service
      await window.service.agentBrowser.addTab(newTab, insertPosition);

      // Update the local state by fetching all tabs from backend
      const tabs = await window.service.agentBrowser.getAllTabs();
      const activeTabId = await window.service.agentBrowser.getActiveTabId();

      set({
        tabs,
        activeTabId,
      });
    } catch (error) {
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

      // Remove from split view if needed
      set(state => {
        const newSplitViewIds = state.splitViewIds.filter(id => id !== tabId);
        return {
          tabs,
          activeTabId,
          closedTabs,
          splitViewIds: newSplitViewIds,
        };
      });
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
      const basicActions = createBasicActions();
      basicActions.transformTabType(tabId, newType, initialData);

      // Update local state by fetching from backend
      const tabs = await window.service.agentBrowser.getAllTabs();

      set({
        tabs,
      });
    } catch (error) {
      console.error('Failed to transform tab type:', error);
    }
  },
});
