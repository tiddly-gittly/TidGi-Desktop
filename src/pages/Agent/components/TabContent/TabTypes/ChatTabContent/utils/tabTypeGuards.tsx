// Type guards for tab related operations
import { IChatTab, TabItem, TabType } from '../../../../../types/tab';

/**
 * Type guard to ensure a tab is a chat tab
 */
export function isChatTab(tab: TabItem): tab is IChatTab {
  return tab.type === TabType.CHAT;
}
