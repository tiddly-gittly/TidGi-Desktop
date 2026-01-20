/**
 * Tab type enumeration
 */
export enum TabType {
  WEB = 'web', // Web page type tab
  CHAT = 'chat', // AI chat type tab
  NEW_TAB = 'new_tab', // New tab
  SPLIT_VIEW = 'split_view', // Split view container tab
  CREATE_NEW_AGENT = 'create_new_agent', // Create new agent definition tab
  EDIT_AGENT_DEFINITION = 'edit_agent_definition', // Edit existing agent definition tab
  WIKI_EMBED = 'wiki_embed', // Embedded wiki BrowserView in Agent page split view
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
  agentId?: string;
  agentDefId?: string;
  /** Initial message to send when tab is created (e.g., from wiki selection) */
  initialMessage?: string;
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

/**
 * Split view tab type
 * Contains child tabs that will be displayed side by side
 */
export interface ISplitViewTab extends ITab {
  type: TabType.SPLIT_VIEW;
  childTabs: TabItem[];
  splitRatio: number;
}

/**
 * Create new agent definition tab type
 */
export interface ICreateNewAgentTab extends ITab {
  type: TabType.CREATE_NEW_AGENT;
  /** Temporary agent definition being created */
  agentDefId?: string;
  /** Current step in the creation process */
  currentStep: number;
  /** Template agent def ID to base the new agent on */
  templateAgentDefId?: string;
}

/**
 * Edit existing agent definition tab type
 */
export interface IEditAgentDefinitionTab extends ITab {
  type: TabType.EDIT_AGENT_DEFINITION;
  /** Agent definition ID being edited */
  agentDefId: string;
  /** Current step in the editing process */
  currentStep?: number;
}

/**
 * Wiki embed tab type - embeds the existing Wiki BrowserView in Agent page split view
 */
export interface IWikiEmbedTab extends ITab {
  type: TabType.WIKI_EMBED;
  /** Workspace ID of the wiki to embed */
  workspaceId: string;
}

export type INewTabButton = {
  id: string;
  title: string;
  type: TabType.NEW_TAB;
};

/**
 * Union type for any type of tab
 */
export type TabItem = IWebTab | IChatTab | INewTab | ISplitViewTab | ICreateNewAgentTab | IEditAgentDefinitionTab | IWikiEmbedTab;
