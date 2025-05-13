import { create } from 'zustand';
import { basicActionsMiddleware } from './actions/basicActions';
import { closeTabsActionsMiddleware } from './actions/closeTabsActions';
import { historyActionsMiddleware } from './actions/historyActions';
import { initializeActionsMiddleware } from './actions/initializeActions';
import { splitViewActionsMiddleware } from './actions/splitViewActions';
import { utilityActionsMiddleware } from './actions/utilityActions';
import { TabsState } from './types';

/**
 * Create and export the tab store
 * This version uses persistence through the agentBrowser service
 */
export const useTabStore = create<TabsState>()((...api) => ({
  tabs: [], // Will be populated with tabs from the service
  activeTabId: null, // Will be set from the service
  splitViewIds: [],
  splitRatio: 50, // Default 50%/50% split ratio
  closedTabs: [], // Will be populated with closed tabs from the service

  // Combine all middlewares
  ...initializeActionsMiddleware(...api),
  ...basicActionsMiddleware(...api),
  ...closeTabsActionsMiddleware(...api),
  ...splitViewActionsMiddleware(...api),
  ...historyActionsMiddleware(...api),
  ...utilityActionsMiddleware(...api),
}));
