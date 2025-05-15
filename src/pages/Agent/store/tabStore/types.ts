import { Subscription } from 'rxjs';
import { TabItem, TabType } from '../../types/tab';

/**
 * Tab close direction
 */
export type TabCloseDirection = 'above' | 'below' | 'other';

/**
 * TabStore state interface
 */
export interface TabsState {
  // All tabs
  tabs: TabItem[];
  // ID of the currently active tab
  activeTabId: string | null;
  // IDs of tabs displayed side by side
  splitViewIds: string[];
  // Split ratio for side-by-side view (20-80)
  splitRatio: number;
  // Recently closed tabs (for restoration)
  closedTabs: TabItem[];
  // Internal RXJS subscription object
  _tabsSubscription$?: Subscription;
  initialize: () => Promise<void>;

  // 基础操作方法
  addTab: (tabType: TabType, initialData?: Partial<TabItem> & { insertPosition?: number }) => Promise<TabItem>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string, isPinned: boolean) => void;
  updateTabData: (tabId: string, data: Partial<TabItem>) => void;
  transformTabType: (tabId: string, newType: TabType, initialData?: Record<string, unknown>) => void;

  // 并排视图相关方法
  addToSplitView: (tabId: string) => void;
  removeFromSplitView: (tabId: string) => void;
  clearSplitView: () => void;
  updateSplitRatio: (ratio: number) => void;

  // 批量关闭和恢复标签页方法
  closeTabs: (direction: TabCloseDirection, fromTabId: string) => void;
  restoreClosedTab: () => void;
  hasClosedTabs: () => boolean;

  // 工具方法
  getTabIndex: (tabId: string) => number;
}

// 常量
export const MAX_CLOSED_TABS = 10;
