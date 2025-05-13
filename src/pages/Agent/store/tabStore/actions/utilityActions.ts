import { StateCreator } from 'zustand';
import { TabsState } from '../types';

/**
 * 标签页工具函数中间件
 */
export const utilityActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'getTabIndex'>
> = (_set, get) => ({
  // 获取标签页在列表中的索引
  getTabIndex: (tabId: string) => {
    const state = get();
    return state.tabs.findIndex(tab => tab.id === tabId);
  },
});
