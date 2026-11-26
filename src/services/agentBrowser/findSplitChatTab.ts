import { type IChatTab, type TabItem, TabType } from '@/pages/Agent/types/tab';
import type { AgentBrowserTabEntity } from '@services/database/schema/agentBrowser';
import type { Repository } from 'typeorm';

/** Split children live in the parent row's JSON; save the parent after editing the child. */
export async function findSplitChatTab(repository: Repository<AgentBrowserTabEntity>, tabId: string) {
  for (const parent of await repository.find({ where: { tabType: TabType.SPLIT_VIEW, opened: true } })) {
    const children = parent.data?.childTabs as TabItem[] | undefined;
    const chat = children?.find((tab): tab is IChatTab => tab.id === tabId && tab.type === TabType.CHAT);
    if (chat) return { parent, chat };
  }
}
