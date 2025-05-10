/**
 * Tab type enumeration
 */
export enum TabType {
  WEB = 'web', // Web page type tab
  CHAT = 'chat', // AI chat type tab
  NEW_TAB = 'new_tab', // New tab
}

/**
 * Tab state
 */
export enum TabState {
  ACTIVE = 'active', // Active state
  INACTIVE = 'inactive', // Inactive state
  LOADING = 'loading', // Loading state
  ERROR = 'error', // Error state
}

/**
 * Base tab interface
 */
export interface ITab {
  id: string;
  type: TabType;
  title: string;
  state: TabState;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Web type tab
 */
export interface IWebTab extends ITab {
  type: TabType.WEB;
  url: string;
  favicon?: string;
}

/**
 * AI chat type tab
 */
export interface IChatTab extends ITab {
  type: TabType.CHAT;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
}

/**
 * New tab type
 */
export interface INewTab extends ITab {
  type: TabType.NEW_TAB;
  favorites?: Array<{
    id: string;
    title: string;
    url: string;
    favicon?: string;
  }>;
}

export type INewTabButton = {
  id: string;
  title: string;
  type: TabType.NEW_TAB;
};

/**
 * Union type for any type of tab
 */
export type TabItem = IWebTab | IChatTab | INewTab;
