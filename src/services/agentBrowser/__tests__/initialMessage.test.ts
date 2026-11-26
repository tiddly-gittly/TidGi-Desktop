import { describe, expect, it, vi } from 'vitest';

import { type IChatTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { AgentBrowserService } from '../index';

describe('AgentBrowserService pending initial message', () => {
  it('round-trips the complete direct-chat replay payload', () => {
    const service = new AgentBrowserService();
    const chat = chatTab();
    const entity = Reflect.apply(
      (service as unknown as { tabItemToEntity(tab: IChatTab, position: number): unknown }).tabItemToEntity,
      service,
      [chat, 0],
    );
    const restored = Reflect.apply(
      (service as unknown as { entityToTabItem(entity: unknown): IChatTab }).entityToTabItem,
      service,
      [entity],
    );

    expect(restored).toEqual(expect.objectContaining({
      initialMessage: 'summarize',
      initialWikiTiddlers: [{ workspaceName: 'Wiki', tiddlerTitle: 'Entry' }],
    }));
  });

  it('atomically clears a matching nested split payload and leaves other children untouched', async () => {
    const child = chatTab();
    const other = { ...chatTab(), id: 'other-tab', agentId: 'other-agent', initialMessage: 'other' };
    const split: { tabType: TabType; opened: boolean; data: { childTabs: IChatTab[] } } = {
      tabType: TabType.SPLIT_VIEW,
      opened: true,
      data: { childTabs: [child, other] },
    };
    const save = vi.fn(async () => undefined);
    const repository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([split]),
      save,
    };
    const service = new AgentBrowserService();
    const mutable = service as unknown as Record<string, unknown>;
    mutable.tabRepository = repository;
    mutable.dataSource = {
      transaction: async (operation: (manager: { getRepository(): typeof repository }) => Promise<boolean>) => operation({ getRepository: () => repository }),
    };
    mutable.updateTabsObservable = vi.fn().mockResolvedValue(undefined);

    await expect(service.acknowledgeInitialMessage('tab-1', 'agent-1', 'summarize')).resolves.toBe(true);

    expect(save).toHaveBeenCalledOnce();
    expect(split.data.childTabs[0]).not.toHaveProperty('initialMessage');
    expect(split.data.childTabs[0]).not.toHaveProperty('initialWikiTiddlers');
    expect(split.data.childTabs[1]).toEqual(other);
  });

  it('does not clear a newer or differently scoped pending message', async () => {
    const direct = {
      tabType: TabType.CHAT,
      opened: true,
      data: { agentId: 'agent-1', initialMessage: 'newer message' },
    };
    const save = vi.fn();
    const repository = { findOne: vi.fn().mockResolvedValue(direct), find: vi.fn(), save };
    const service = new AgentBrowserService();
    const mutable = service as unknown as Record<string, unknown>;
    mutable.tabRepository = repository;
    mutable.dataSource = {
      transaction: async (operation: (manager: { getRepository(): typeof repository }) => Promise<boolean>) => operation({ getRepository: () => repository }),
    };
    mutable.updateTabsObservable = vi.fn();

    await expect(service.acknowledgeInitialMessage('tab-1', 'agent-1', 'old message')).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(direct.data.initialMessage).toBe('newer message');
  });
});

function chatTab(): IChatTab {
  return {
    id: 'tab-1',
    type: TabType.CHAT,
    title: 'Chat',
    state: TabState.ACTIVE,
    isPinned: false,
    createdAt: 1,
    updatedAt: 1,
    agentId: 'agent-1',
    agentDefId: 'definition-1',
    initialMessage: 'summarize',
    initialWikiTiddlers: [{ workspaceName: 'Wiki', tiddlerTitle: 'Entry' }],
  };
}
