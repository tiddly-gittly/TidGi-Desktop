import { nanoid } from 'nanoid';
import { StateCreator } from 'zustand';
import { IChatTab, INewTab, IWebTab, TabItem, TabState, TabType } from '../../../types/tab';
import { MAX_CLOSED_TABS, TabsState } from '../types';

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
  closeTab: () => {},

  // 设置激活的标签页
  setActiveTab: () => {},

  // 固定/取消固定标签页
  pinTab: () => {},

  // 更新标签页数据
  updateTabData: async () => {},

  // 转换标签页类型
  transformTabType: async () => {},
});

/**
 * 标签页基础操作中间件
 */
export const basicActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'addTab' | 'closeTab' | 'setActiveTab' | 'pinTab' | 'updateTabData' | 'transformTabType'>
> = (set, _get) => ({
  // 添加新标签页
  addTab: async (tabType: TabType, initialData = {}) => {
    const newTab = await createBasicActions().addTab(tabType, initialData);
    const { insertPosition } = initialData;

    set(state => {
      const updatedTabs = state.tabs.map(tab => ({
        ...tab,
        state: TabState.INACTIVE,
      }));

      // 处理在特定位置插入标签页
      if (insertPosition !== undefined && Number.isInteger(insertPosition)) {
        // 考虑固定标签页的存在，计算实际插入位置
        const pinnedTabsCount = updatedTabs.filter(tab => tab.isPinned).length;
        const actualPosition = Math.max(pinnedTabsCount, Math.min(insertPosition, updatedTabs.length));
        updatedTabs.splice(actualPosition, 0, newTab);
        return {
          tabs: updatedTabs,
          activeTabId: newTab.id,
        };
      }

      return {
        tabs: [...updatedTabs, newTab],
        activeTabId: newTab.id,
      };
    });

    return newTab;
  },

  // 关闭标签页
  closeTab: (tabId: string) => {
    set(state => {
      const tabToClose = state.tabs.find(tab => tab.id === tabId);
      if (!tabToClose) return state;

      const tabIndex = state.tabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return state;

      const newTabs = [...state.tabs];
      newTabs.splice(tabIndex, 1);

      // 如果关闭的是当前激活的标签页，则激活下一个或前一个标签页
      let newActiveTabId = state.activeTabId;
      if (state.activeTabId === tabId) {
        if (newTabs.length > 0) {
          const nextTab = newTabs[tabIndex] || newTabs[tabIndex - 1];
          newActiveTabId = nextTab.id;

          // 更新新的激活标签页状态
          if (newActiveTabId) {
            newTabs.forEach(tab => {
              if (tab.id === newActiveTabId) {
                tab.state = TabState.ACTIVE;
              }
            });
          }
        } else {
          newActiveTabId = null;
        }
      }

      // 从并排视图中移除
      const newSplitViewIds = state.splitViewIds.filter(id => id !== tabId);

      // 添加到关闭的标签页历史
      const newClosedTabs = [tabToClose, ...state.closedTabs].slice(0, MAX_CLOSED_TABS);

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
        splitViewIds: newSplitViewIds,
        closedTabs: newClosedTabs,
      };
    });
  },

  // 设置激活的标签页
  setActiveTab: (tabId: string) => {
    set(state => {
      // 设置新的激活标签页
      const tabs = state.tabs.map(tab => ({
        ...tab,
        state: tab.id === tabId ? TabState.ACTIVE : TabState.INACTIVE,
      }));

      return {
        tabs,
        activeTabId: tabId,
      };
    });
  },

  // 固定/取消固定标签页
  pinTab: (tabId: string, isPinned: boolean) => {
    set(state => {
      const tabs = state.tabs.map(tab => tab.id === tabId ? { ...tab, isPinned } : tab);

      // 重新排序，将固定的标签页排在前面
      const pinnedTabs = tabs.filter(tab => tab.isPinned);
      const unpinnedTabs = tabs.filter(tab => !tab.isPinned);

      return {
        tabs: [...pinnedTabs, ...unpinnedTabs],
      };
    });
  },

  // 更新标签页数据
  updateTabData: (tabId: string, data: Partial<TabItem>) => {
    set(state => {
      const timestamp = Date.now();
      const updatedTabs = state.tabs.map(tab => {
        if (tab.id === tabId) {
          switch (tab.type) {
            case TabType.WEB:
              return { ...tab, ...data, updatedAt: timestamp } as IWebTab;
            case TabType.CHAT:
              return { ...tab, ...data, updatedAt: timestamp } as IChatTab;
            case TabType.NEW_TAB:
              return { ...tab, ...data, updatedAt: timestamp } as INewTab;
            default:
              return tab;
          }
        }
        return tab;
      });
      return {
        ...state,
        tabs: updatedTabs,
      };
    });
  },

  // 转换标签页类型
  transformTabType: async (tabId: string, newType: TabType, initialData: Record<string, unknown> = {}) => {
    // 如果要转换为 CHAT 类型，需要先创建 agent
    if (newType === TabType.CHAT) {
      const agent = await window.service.agentInstance.createAgent(initialData.agentDefId as string);
      initialData = {
        ...initialData,
        agentId: agent.id,
        agentDefId: agent.agentDefId,
        title: initialData.title || agent.name,
      };
    }

    set(state => {
      const tabIndex = state.tabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return state;

      const oldTab = state.tabs[tabIndex];
      const timestamp = Date.now();

      // 创建新标签页的通用基础属性
      const baseProps = {
        id: oldTab.id,
        state: oldTab.state,
        isPinned: oldTab.isPinned,
        createdAt: oldTab.createdAt,
        updatedAt: timestamp,
      };

      // 安全地获取值
      const getInitialValue = <T>(key: string, defaultValue: T): T => {
        return (initialData[key] as T) ?? defaultValue;
      };

      // 创建新的标签页
      const newTabs = [...state.tabs];

      if (newType === TabType.WEB) {
        const webTab: IWebTab = {
          ...baseProps,
          type: TabType.WEB,
          title: getInitialValue<string>('title', 'agent.tabTitle.newWeb'),
          url: getInitialValue<string>('url', 'about:blank'),
        };
        newTabs[tabIndex] = webTab;
      } else if (newType === TabType.CHAT) {
        const chatTab: IChatTab = {
          ...baseProps,
          type: TabType.CHAT,
          title: getInitialValue<string>('title', 'agent.tabTitle.newChat'),
          agentId: getInitialValue<string>('agentId', ''),
          agentDefId: getInitialValue<string>('agentDefId', ''),
        };
        newTabs[tabIndex] = chatTab;
      } else {
        const newTab: INewTab = {
          ...baseProps,
          type: TabType.NEW_TAB,
          title: getInitialValue<string>('title', 'agent.tabTitle.newTab'),
          favorites: getInitialValue<Array<{ id: string; title: string; url: string; favicon?: string }>>('favorites', []),
        };
        newTabs[tabIndex] = newTab;
      }

      return {
        ...state,
        tabs: newTabs,
      };
    });
  },
});
