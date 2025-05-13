import { StateCreator } from 'zustand';
import { TabsState } from '../types';

/**
 * 并排视图操作中间件
 */
export const splitViewActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'addToSplitView' | 'removeFromSplitView' | 'clearSplitView' | 'updateSplitRatio'>
> = (set) => ({
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
});
