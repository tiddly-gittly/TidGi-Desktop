import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { IChatTab, INewTab, IWebTab, TabItem, TabState, TabType } from '../types/tab';
import { createInitialTabs } from './initialData';

type TabCloseDirection = 'above' | 'below' | 'other';

interface TabsState {
  // 所有标签页
  tabs: TabItem[];
  // 当前激活的标签页ID
  activeTabId: string | null;
  // 并排显示的标签页IDs
  splitViewIds: string[];
  // 并排视图分割比例 (20-80)
  splitRatio: number;
  // 最近关闭的标签页 (用于恢复)
  closedTabs: TabItem[];

  // 操作方法
  addTab: (tabType: TabType, initialData?: Partial<TabItem> & { insertPosition?: number }) => TabItem;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string, isPinned: boolean) => void;
  updateTabData: (tabId: string, data: Partial<TabItem>) => void;

  // 并排标签页相关
  addToSplitView: (tabId: string) => void;
  removeFromSplitView: (tabId: string) => void;
  clearSplitView: () => void;
  updateSplitRatio: (ratio: number) => void;

  // 批量关闭和恢复标签页功能
  closeTabs: (direction: TabCloseDirection, fromTabId: string) => void;
  restoreClosedTab: () => void;
  hasClosedTabs: () => boolean;

  // 工具方法
  getTabIndex: (tabId: string) => number;
}

// 初始化标签页数据
const initialTabs = createInitialTabs();
const firstActiveTab = initialTabs.find(tab => tab.state === TabState.ACTIVE);

// 最大保存的已关闭标签页数量
const MAX_CLOSED_TABS = 10;

export const useTabStore = create<TabsState>((set, get) => ({
  tabs: initialTabs,
  activeTabId: firstActiveTab?.id || null,
  splitViewIds: [],
  splitRatio: 50, // 默认50%/50%的分割比例
  closedTabs: [], // 已关闭的标签页

  // 添加新标签页
  addTab: (tabType: TabType, initialData = {}) => {
    const timestamp = Date.now();
    const { insertPosition } = initialData;
    delete initialData.insertPosition; // 从传递给标签页的数据中移除

    let newTab: TabItem;

    const tabBase = {
      id: nanoid(),
      state: TabState.ACTIVE,
      isPinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...initialData,
    };

    switch (tabType) {
      case TabType.WEB:
        newTab = {
          ...tabBase,
          type: TabType.WEB,
          title: initialData.title || 'agent.tabTitle.newWeb',
          url: (initialData as Partial<IWebTab>).url || 'about:blank',
        } as IWebTab;
        break;

      case TabType.CHAT:
        newTab = {
          ...tabBase,
          type: TabType.CHAT,
          title: initialData.title || 'agent.tabTitle.newChat',
          messages: (initialData as Partial<IChatTab>).messages || [],
        } as IChatTab;
        break;

      case TabType.NEW_TAB:
      default:
        newTab = {
          ...tabBase,
          type: TabType.NEW_TAB,
          title: initialData.title || 'agent.tabTitle.newTab',
          favorites: (initialData as Partial<INewTab>).favorites || [],
        } as INewTab;
        break;
    }

    set(state => {
      // 将所有标签页设为非活动状态
      const updatedTabs = state.tabs.map(tab => ({
        ...tab,
        state: TabState.INACTIVE,
      }));

      // 处理在特定位置插入标签页
      if (insertPosition !== undefined && Number.isInteger(insertPosition)) {
        // 考虑固定标签页的存在，计算实际插入位置
        const pinnedTabsCount = updatedTabs.filter(tab => tab.isPinned).length;
        const actualPosition = Math.max(
          pinnedTabsCount, // 不能插入到固定标签页之前
          Math.min(insertPosition, updatedTabs.length), // 不能超出数组长度
        );

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
          newActiveTabId = nextTab ? nextTab.id : null;

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

  // 批量关闭标签页
  closeTabs: (direction: TabCloseDirection, fromTabId: string) => {
    set(state => {
      const tabIndex = state.tabs.findIndex(tab => tab.id === fromTabId);
      if (tabIndex === -1) return state;

      // 获取要保留的标签页ID列表
      const tabsToKeep: TabItem[] = [];
      const tabsToClose: TabItem[] = [];

      // 根据不同方向，确定要关闭的标签页
      state.tabs.forEach((tab, index) => {
        // 固定的标签页永远不关闭
        if (tab.isPinned) {
          tabsToKeep.push(tab);
          return;
        }

        switch (direction) {
          case 'above':
            if (index >= tabIndex || index < state.tabs.findIndex(t => !t.isPinned)) {
              tabsToKeep.push(tab);
            } else {
              tabsToClose.push(tab);
            }
            break;
          case 'below':
            if (index <= tabIndex) {
              tabsToKeep.push(tab);
            } else {
              tabsToClose.push(tab);
            }
            break;
          case 'other':
            if (index === tabIndex || tab.isPinned) {
              tabsToKeep.push(tab);
            } else {
              tabsToClose.push(tab);
            }
            break;
        }
      });

      // 更新激活的标签页ID
      let newActiveTabId = state.activeTabId;
      if (!tabsToKeep.some(tab => tab.id === newActiveTabId)) {
        const targetTab = tabsToKeep.find(tab => tab.id === fromTabId);
        if (targetTab) {
          newActiveTabId = targetTab.id;

          // 设置新激活标签页的状态
          tabsToKeep.forEach(tab => {
            tab.state = tab.id === newActiveTabId ? TabState.ACTIVE : TabState.INACTIVE;
          });
        } else {
          newActiveTabId = tabsToKeep.length > 0 ? tabsToKeep[0].id : null;
        }
      }

      // 从并排视图中移除已关闭的标签页
      const newSplitViewIds = state.splitViewIds.filter(id => tabsToKeep.some(tab => tab.id === id));

      // 添加到关闭标签页历史
      const newClosedTabs = [...tabsToClose, ...state.closedTabs].slice(0, MAX_CLOSED_TABS);

      return {
        tabs: tabsToKeep,
        activeTabId: newActiveTabId,
        splitViewIds: newSplitViewIds,
        closedTabs: newClosedTabs,
      };
    });
  },

  // 恢复最近关闭的标签页
  restoreClosedTab: () => {
    set(state => {
      if (state.closedTabs.length === 0) return state;

      const [tabToRestore, ...remainingClosedTabs] = state.closedTabs;

      // 设置所有标签页为非活动状态
      const updatedTabs = state.tabs.map(tab => ({
        ...tab,
        state: TabState.INACTIVE,
      }));

      // 恢复标签页为活动状态
      const restoredTab = {
        ...tabToRestore,
        state: TabState.ACTIVE,
        createdAt: Date.now(), // 更新创建时间，让它排序在前面
      };

      return {
        tabs: [...updatedTabs, restoredTab],
        activeTabId: restoredTab.id,
        closedTabs: remainingClosedTabs,
      };
    });
  },

  // 检查是否有已关闭的标签页
  hasClosedTabs: () => {
    return get().closedTabs.length > 0;
  },

  // 获取标签页在列表中的索引
  getTabIndex: (tabId: string) => {
    const state = get();
    return state.tabs.findIndex(tab => tab.id === tabId);
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
      const tabs = state.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, ...data, updatedAt: Date.now() }
          : tab
      );

      return { tabs };
    });
  },

  // 添加到并排视图
  addToSplitView: (tabId: string) => {
    set(state => {
      // 最多同时显示两个并排标签页
      if (state.splitViewIds.includes(tabId) || state.splitViewIds.length >= 2) {
        return state;
      }

      return {
        splitViewIds: [...state.splitViewIds, tabId],
      };
    });
  },

  // 从并排视图中移除
  removeFromSplitView: (tabId: string) => {
    set(state => ({
      splitViewIds: state.splitViewIds.filter(id => id !== tabId),
    }));
  },

  // 清空并排视图
  clearSplitView: () => {
    set(() => ({
      splitViewIds: [],
    }));
  },

  // 更新分割比例
  updateSplitRatio: (ratio: number) => {
    set(() => ({
      splitRatio: Math.max(20, Math.min(80, ratio)),
    }));
  },
}));
