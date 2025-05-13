import { create } from 'zustand';
import { TabState } from '../../types/tab';
import { createInitialTabs } from '../initialData';
import { basicActionsMiddleware } from './actions/basicActions';
import { historyActionsMiddleware } from './actions/historyActions';
import { splitViewActionsMiddleware } from './actions/splitViewActions';
import { utilityActionsMiddleware } from './actions/utilityActions';
import { TabsState } from './types';

/**
 * 初始化标签页数据
 */
const initialTabs = createInitialTabs();
const firstActiveTab = initialTabs.find(tab => tab.state === TabState.ACTIVE);

/**
 * 创建并导出标签页 Store
 */
export const useTabStore = create<TabsState>()((...api) => ({
  tabs: initialTabs,
  activeTabId: firstActiveTab?.id || null,
  splitViewIds: [],
  splitRatio: 50, // 默认 50%/50% 拆分比例
  closedTabs: [], // 已关闭的标签页

  // 组合所有中间件
  ...basicActionsMiddleware(...api),
  ...splitViewActionsMiddleware(...api),
  ...historyActionsMiddleware(...api),
  ...utilityActionsMiddleware(...api),
}));
