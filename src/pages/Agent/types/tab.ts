/**
 * 标签页类型枚举
 */
export enum TabType {
  WEB = 'web', // 网页类型标签
  CHAT = 'chat', // AI聊天类型标签
  NEW_TAB = 'new_tab', // 新标签页
}

/**
 * 标签页状态
 */
export enum TabState {
  ACTIVE = 'active', // 激活状态
  INACTIVE = 'inactive', // 非激活状态
  LOADING = 'loading', // 加载中
  ERROR = 'error', // 错误状态
}

/**
 * 基础标签页接口
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
 * 网页类型标签页
 */
export interface IWebTab extends ITab {
  type: TabType.WEB;
  url: string;
  favicon?: string;
}

/**
 * AI聊天类型标签页
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
 * 新标签页类型
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

/**
 * 任意类型的标签页
 */
export type TabItem = IWebTab | IChatTab | INewTab;