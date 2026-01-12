import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { AgentChannel } from '@/constants/channels';
import { TabCloseDirection } from '@/pages/Agent/store/tabStore/types';
import { BehaviorSubject } from 'rxjs';
import { TabItem } from '../../pages/Agent/types/tab';

/**
 * Agent Browser Service interface
 * Handles persistent tab management for the agent browser
 */
export interface IAgentBrowserService {
  tabs$: BehaviorSubject<TabItem[]>;
  updateTabsObservable(): Promise<void>;
  /**
   * Initialize the service on application startup
   */
  initialize(): Promise<void>;

  /**
   * Get all tabs
   * @returns List of all tabs
   */
  getAllTabs(): Promise<TabItem[]>;

  /**
   * Get active tab ID
   * @returns The active tab ID or null if no active tab
   */
  getActiveTabId(): Promise<string | null>;

  /**
   * Set active tab
   * @param tabId The ID of the tab to activate
   */
  setActiveTab(tabId: string): Promise<void>;

  /**
   * Add new tab
   * @param tab Tab data
   * @param position Optional position to insert the tab
   */
  addTab(tab: TabItem, position?: number): Promise<TabItem>;

  /**
   * Update tab data
   * @param tabId Tab ID
   * @param data Partial tab data to update
   */
  updateTab(tabId: string, data: Partial<TabItem>): Promise<void>;

  /**
   * Close tab by ID
   * @param tabId Tab ID to close
   */
  closeTab(tabId: string): Promise<void>;

  /**
   * Close multiple tabs based on direction
   * @param direction Direction to close tabs
   * @param fromTabId Reference tab ID
   */
  closeTabs(direction: TabCloseDirection, fromTabId: string): Promise<void>;

  /**
   * Pin or unpin tab
   * @param tabId Tab ID
   * @param isPinned Whether tab should be pinned
   */
  pinTab(tabId: string, isPinned: boolean): Promise<void>;

  /**
   * Get recently closed tabs
   * @param limit Maximum number of closed tabs to return
   */
  getClosedTabs(limit?: number): Promise<TabItem[]>;

  /**
   * Restore the most recently closed tab
   * @returns The restored tab or null if no closed tabs
   */
  restoreClosedTab(): Promise<TabItem | null>;

  /**
   * Find existing or create new "Talk with AI" split view tab
   * Reuses existing split view with matching workspace if available
   * @param workspaceId Wiki workspace ID to embed
   * @param agentDefinitionId Agent definition ID to use
   * @param selectionText Selected text to send to agent
   * @returns The tab ID to activate
   */
  findOrCreateTalkWithAITab(workspaceId: string | undefined, agentDefinitionId: string | undefined, selectionText: string): Promise<string>;
}

/**
 * IPC descriptor for AgentBrowser service
 * Defines which methods are exposed to the renderer process
 */
export const AgentBrowserServiceIPCDescriptor = {
  channel: AgentChannel.browser,
  properties: {
    tabs$: ProxyPropertyType.Value$,
    updateTabsObservable: ProxyPropertyType.Function,
    getAllTabs: ProxyPropertyType.Function,
    getActiveTabId: ProxyPropertyType.Function,
    setActiveTab: ProxyPropertyType.Function,
    addTab: ProxyPropertyType.Function,
    updateTab: ProxyPropertyType.Function,
    closeTab: ProxyPropertyType.Function,
    closeTabs: ProxyPropertyType.Function,
    pinTab: ProxyPropertyType.Function,
    getClosedTabs: ProxyPropertyType.Function,
    restoreClosedTab: ProxyPropertyType.Function,
    findOrCreateTalkWithAITab: ProxyPropertyType.Function,
  },
};
