import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type IChatTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { DesktopAgentChatTab, resolveDesktopAskQuestion } from '../DesktopAgentChatTab';

const lifecycle = vi.hoisted(() => ({
  sessions: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
  timelines: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('memeloop', () => ({
  AgentSessionController: class {
    start = vi.fn(async () => undefined);
    stop = vi.fn();
    constructor() {
      lifecycle.sessions.push(this);
    }
  },
  extractAgentRunError: vi.fn(() => null),
}));

vi.mock('@memeloop/react-ui/chat', () => ({
  ConversationTimelineWindowController: class {
    dispose = vi.fn();
    constructor() {
      lifecycle.timelines.push(this);
    }
  },
}));

vi.mock('@memeloop/react-ui/agent', () => ({
  AgentSessionProvider: () => null,
}));

vi.mock('../components/AgentSwitcher', () => ({ AgentSwitcher: () => null }));
vi.mock('../components/CompactModelSelector', () => ({ CompactModelSelector: () => null }));
vi.mock('../components/PromptPreviewButtonWithMenu', () => ({ PromptPreviewButtonWithMenu: () => null }));
vi.mock('../DesktopPromptPreviewController', () => ({
  createDesktopPromptPreviewController: () => ({ close: vi.fn() }),
}));

describe('DesktopAgentChatTab lifecycle', () => {
  it('awaits the Desktop ask-question IPC port with the exact question identity', async () => {
    const resolveAskQuestion = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.service, 'agentInstance', {
      configurable: true,
      value: { resolveAskQuestion },
    });

    await expect(resolveDesktopAskQuestion('agent-1', 'question-1', 'Approach A')).resolves.toBeUndefined();
    expect(resolveAskQuestion).toHaveBeenCalledWith('agent-1', 'question-1', 'Approach A');
  });

  it('disposes the old timeline on conversation switch and again on unmount', async () => {
    lifecycle.sessions.length = 0;
    lifecycle.timelines.length = 0;
    const first = tab('agent-1');
    const view = render(<DesktopAgentChatTab tab={first} />);
    expect(lifecycle.sessions).toHaveLength(1);
    expect(lifecycle.timelines).toHaveLength(1);
    expect(lifecycle.sessions[0]?.start).toHaveBeenCalledWith({ agentId: 'agent-1', conversationId: 'agent-1' });

    view.rerender(<DesktopAgentChatTab tab={{ ...first, agentId: 'agent-2' }} />);
    expect(lifecycle.sessions[0]?.stop).toHaveBeenCalledOnce();
    expect(lifecycle.timelines[0]?.dispose).toHaveBeenCalledOnce();
    expect(lifecycle.sessions).toHaveLength(2);
    expect(lifecycle.timelines).toHaveLength(2);

    view.unmount();
    expect(lifecycle.sessions[1]?.stop).toHaveBeenCalledOnce();
    expect(lifecycle.timelines[1]?.dispose).toHaveBeenCalledOnce();
  });
});

function tab(agentId: string): IChatTab {
  return {
    id: 'tab-1',
    type: TabType.CHAT,
    title: 'Chat',
    state: TabState.ACTIVE,
    isPinned: false,
    createdAt: 1,
    updatedAt: 1,
    agentId,
    agentDefId: 'definition-1',
  };
}
