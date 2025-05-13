import { StateCreator } from 'zustand';
import { TabCloseDirection, TabsState } from '../types';

/**
 * 批量关闭标签页的中间件
 */
export const closeTabsActionsMiddleware: StateCreator<
  TabsState,
  [],
  [],
  Pick<TabsState, 'closeTabs'>
> = (set, _get) => ({
  /**
   * 批量关闭标签页
   * @param direction 关闭的方向：above（上方）、below（下方）或 other（其他）
   * @param fromTabId 参考标签页的ID
   */
  closeTabs: async (direction: TabCloseDirection, fromTabId: string) => {
    try {
      // 调用后端服务关闭标签页
      await window.service.agentBrowser.closeTabs(direction, fromTabId);

      // 更新本地状态
      const tabs = await window.service.agentBrowser.getAllTabs();
      const activeTabId = await window.service.agentBrowser.getActiveTabId();
      const closedTabs = await window.service.agentBrowser.getClosedTabs();

      set({
        tabs,
        activeTabId,
        closedTabs,
      });
    } catch (error) {
      console.error('Failed to close tabs:', error);
    }
  },
});
