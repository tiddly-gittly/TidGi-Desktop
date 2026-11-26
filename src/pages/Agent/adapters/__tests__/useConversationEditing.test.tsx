import { act, renderHook } from '@testing-library/react';
import type { ConversationBranchState, ConversationMessageListProjection, ConversationTimelinePageSuccess } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type IChatTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { useConversationEditing } from '../hooks/useConversationEditing';

vi.mock('@/pages/Agent/store/tabStore', () => ({ useTabStore: { setState: vi.fn() } }));

const getBranches = vi.fn();
const loadSource = vi.fn();
const saveDraft = vi.fn();
const originalAgentInstance = window.service.agentInstance;
const branch: ConversationBranchState = {
  messageId: 'user',
  selected: 0,
  alternatives: [{ conversationId: 'first', messageId: 'user' }, { conversationId: 'fork', messageId: 'edited' }],
};
const tab: IChatTab & { agentId: string } = {
  id: 'tab',
  agentId: 'first',
  type: TabType.CHAT,
  state: TabState.ACTIVE,
  title: 'Chat',
  isPinned: false,
  createdAt: 1,
  updatedAt: 1,
};
function message(messageId: string, role: 'user' | 'assistant', content = ''): ConversationMessageListProjection {
  return { messageId, role, content, conversationId: 'first', turnId: 'user', originNodeId: 'peer', originSequence: 1, lamportClock: 1, timestamp: 1 };
}
function props() {
  return {
    tab,
    messages: [message('user', 'user'), message('assistant', 'assistant')],
    revision: 'r1',
    running: true,
    timeline: undefined as ConversationTimelinePageSuccess | undefined,
  };
}
function mount(initialProps = props()) {
  return renderHook(value => useConversationEditing(value.tab, value.messages, value.timeline, value.revision, value.running), { initialProps });
}
async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  getBranches.mockReset().mockResolvedValue([branch]);
  loadSource.mockReset().mockResolvedValue({ text: 'source', sourceRevision: 'source1', draft: { text: 'draft', revision: 2 } });
  saveDraft.mockReset().mockResolvedValue(3);
  Object.defineProperty(window.service, 'agentInstance', {
    configurable: true,
    value: { getConversationBranches: getBranches, loadConversationEditSource: loadSource, saveConversationEditDraft: saveDraft },
  });
});
afterEach(() => {
  Object.defineProperty(window.service, 'agentInstance', { configurable: true, value: originalAgentInstance });
});

describe('conversation branch refresh', () => {
  it('retains branches during 20 assistant updates and refreshes on canonical and terminal changes', async () => {
    const initial = props();
    const view = mount(initial);
    await settle();
    for (let tick = 0; tick < 20; tick++) {
      view.rerender({ ...initial, messages: [message('user', 'user'), message('assistant', 'assistant', `chunk ${tick}`)] });
    }
    expect(getBranches).toHaveBeenCalledTimes(1);
    expect(view.result.current.branches).toEqual([branch]);
    let finish!: (value: ConversationBranchState[]) => void;
    getBranches.mockImplementationOnce(() =>
      new Promise(resolve => {
        finish = resolve;
      })
    );
    view.rerender({ ...initial, revision: 'r2' });
    expect(view.result.current.branches).toEqual([branch]);
    await act(async () => {
      finish([{ ...branch, selected: 1 }]);
    });
    expect(view.result.current.branches[0].selected).toBe(1);
    view.rerender({ ...initial, revision: 'r2', running: false });
    await settle();
    expect(getBranches).toHaveBeenCalledTimes(3);
  });

  it('refreshes new user pages, timeline users, tab activation and window focus', async () => {
    const initial = props();
    const view = mount(initial);
    await settle();
    const paged = { ...initial, messages: [...initial.messages, message('paged-user', 'user')] };
    view.rerender(paged);
    await settle();
    expect(getBranches).toHaveBeenLastCalledWith('first', ['user', 'paged-user']);
    const timeline = { items: [{ kind: 'message', role: 'user', messageId: 'timeline-user' }] } as ConversationTimelinePageSuccess;
    view.rerender({ ...paged, timeline });
    await settle();
    expect(getBranches).toHaveBeenLastCalledWith('first', ['user', 'paged-user', 'timeline-user']);
    view.rerender({ ...paged, timeline, tab: { ...tab, state: TabState.INACTIVE } });
    await settle();
    view.rerender({ ...paged, timeline });
    await settle();
    const listener = vi.mocked(window.addEventListener).mock.calls.filter(([event]) => event === 'focus').at(-1)![1] as EventListener;
    await act(async () => {
      listener(new Event('focus'));
    });
    expect(getBranches).toHaveBeenCalledTimes(6);
  });

  it('isolates a delayed old conversation response and preserves draft operations', async () => {
    let finish!: (value: ConversationBranchState[]) => void;
    getBranches.mockImplementationOnce(() =>
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const initial = props();
    const view = mount(initial);
    const next = { ...initial, tab: { ...tab, agentId: 'next' } };
    getBranches.mockResolvedValue([{ ...branch, messageId: 'next-user' }]);
    view.rerender(next);
    expect(view.result.current.branches).toEqual([]);
    await settle();
    await act(async () => {
      finish([branch]);
    });
    expect(view.result.current.branches[0].messageId).toBe('next-user');
    expect(await view.result.current.loadSource('next-user')).toMatchObject({ draft: { text: 'draft', revision: 2 } });
    await view.result.current.saveDraft('next-user', 'edited draft', 2);
    expect(saveDraft).toHaveBeenCalledWith({ conversationId: 'next', messageId: 'next-user', text: 'edited draft', expectedRevision: 2 });
  });

  it('keeps the latest foreground refresh when an earlier request finishes later', async () => {
    let first!: (value: ConversationBranchState[]) => void;
    getBranches.mockImplementationOnce(() =>
      new Promise(resolve => {
        first = resolve;
      })
    );
    const view = mount();
    getBranches.mockResolvedValue([{ ...branch, selected: 1 }]);
    const listener = vi.mocked(window.addEventListener).mock.calls.filter(([event]) => event === 'focus').at(-1)![1] as EventListener;
    await act(async () => {
      listener(new Event('focus'));
    });
    expect(view.result.current.branches[0].selected).toBe(1);
    await act(async () => {
      first([branch]);
    });
    expect(view.result.current.branches[0].selected).toBe(1);
  });
});
