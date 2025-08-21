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
  // Recently closed tabs (for restoration)
  closedTabs: TabItem[];
  // Internal RXJS subscription object
  _tabsSubscription$?: Subscription;
  initialize: () => Promise<void>;

  // Basic tab operations
  addTab: (tabType: TabType, initialData?: Partial<TabItem> & { insertPosition?: number }) => Promise<TabItem>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string, isPinned: boolean) => void;
  updateTabData: (tabId: string, data: Partial<TabItem>) => void;
  transformTabType: (tabId: string, newType: TabType, initialData?: Record<string, unknown>) => void;

  // Split view operations
  createSplitViewFromTabs: (tabId: string) => Promise<void>;
  removeFromSplitView: (tabId: string) => Promise<void>;
  updateSplitRatio: (ratio: number) => Promise<void>;
  convertToSplitView: (tabId: string) => Promise<void>;
  addTabToSplitView: (splitViewTabId: string, tabId: string) => Promise<void>;

  // Bulk close and restore tab operations
  closeTabs: (direction: TabCloseDirection, fromTabId: string) => void;
  restoreClosedTab: () => void;
  hasClosedTabs: () => boolean;

  // Utility methods
  getTabIndex: (tabId: string) => number;
  createAgentChatTab: (agentDefinitionId?: string) => Promise<TabItem>;
}

// Constants
export const MAX_CLOSED_TABS = 10;
