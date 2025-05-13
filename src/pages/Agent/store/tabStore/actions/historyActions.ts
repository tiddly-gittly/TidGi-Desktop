import { StateCreator } from 'zustand';
import { TabItem, TabState } from '../../../types/tab';
import { MAX_CLOSED_TABS, TabCloseDirection, TabsState } from '../types';

/**
 * 标签页历史操作中间件
 */
export const historyActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'closeTabs' | 'restoreClosedTab' | 'hasClosedTabs'>
> = (set, get) => ({
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
            if (index <= tabIndex) {
              tabsToKeep.push(tab);
            } else {
              tabsToClose.push(tab);
            }
            break;
          case 'below':
            if (index >= tabIndex || index < state.tabs.findIndex(t => !t.isPinned)) {
              tabsToKeep.push(tab);
            } else {
              tabsToClose.push(tab);
            }
            break;
          case 'other':
            // 固定标签页的处理已在前面完成，这里只需处理与当前标签页相同的情况
            if (index === tabIndex) {
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
});
