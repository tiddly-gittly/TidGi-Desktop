import { TabState } from '@/pages/Agent/types/tab';
import { StateCreator } from 'zustand';
import { TabsState } from '../types';

/**
 * Initialize tab store actions
 * Loads tabs data from the backend service
 */
export const initializeActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'initialize'>
> = (set, get) => ({
  /**
   * Initialize the tab store by loading data from the backend service
   * This should be called when the application starts
   */
  initialize: async () => {
    try {
      // Clean up old subscription if it exists
      const state = get();
      if (state._tabsSubscription$) {
        state._tabsSubscription$.unsubscribe();
      }

      // 获取关闭的标签页
      const closedTabs = await window.service.agentBrowser.getClosedTabs();

      // 初始化标签页，同时订阅 tabs$ 流以获取实时更新
      const tabs = await window.service.agentBrowser.getAllTabs();
      const activeTab = tabs.find(tab => tab.state === TabState.ACTIVE);

      // Create subscription to tabs$ stream
      const tabsSubscription$ = window.observables.agentBrowser.tabs$.subscribe(tabs => {
        const activeTab = tabs.find(tab => tab.state === TabState.ACTIVE);

        set({
          tabs,
          activeTabId: activeTab?.id || null,
        });
      });

      // 更新 store 状态
      set({
        tabs,
        activeTabId: activeTab?.id || null,
        closedTabs,
        _tabsSubscription$: tabsSubscription$,
      });
    } catch (error) {
      console.error('Failed to initialize tab store:', error);

      // 初始化失败时，设置空状态以避免 UI 错误
      set({
        tabs: [],
        activeTabId: null,
        closedTabs: [],
      });
    }
  },
});
