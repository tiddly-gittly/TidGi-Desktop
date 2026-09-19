import { render } from '@testing-library/react';
import React, { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type IChatTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { createDesktopMessageLabels, DesktopAgentChatTab, resolveDesktopAskQuestion } from '../DesktopAgentChatTab';

const lifecycle = vi.hoisted(() => ({
  sessions: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    getSnapshot: () => unknown;
    subscribe: () => () => void;
  }>,
  sessionOptions: [] as unknown[],
  timelines: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('memeloop', () => ({
  AgentSessionController: class {
    start = vi.fn(async () => undefined);
    stop = vi.fn();
    getSnapshot() {
      return {
        agent: null,
        loading: false,
        loadingMoreBefore: false,
        loadingMoreAfter: false,
        error: null,
        messages: [],
        orderedMessageIds: [],
        streamingMessageIds: new Set(),
        pendingNewMessageCount: 0,
      };
    }
    subscribe() {
      return () => {};
    }
    constructor(options: unknown) {
      lifecycle.sessionOptions.push(options);
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
  it('forwards every shared message capability to the Desktop locale namespace', () => {
    const t = vi.fn((key: string, values?: Record<string, unknown>) => `${key}${values ? `:${JSON.stringify(values)}` : ''}`);
    const labels = createDesktopMessageLabels(t as never);

    expect(labels).toMatchObject({
      attachmentLoadFailed: 'Chat.Message.AttachmentLoadFailed',
      reloadDetails: 'Chat.Message.ReloadDetails',
      detailTruncated: 'Chat.Message.DetailTruncated',
      detailLoadFailed: 'Chat.Message.DetailLoadFailed',
      exportFullMessage: 'Chat.Message.ExportFullMessage',
      reasoning: 'Chat.Message.Reasoning',
      thinking: 'Chat.Message.Thinking',
      showReasoning: 'Chat.Message.ShowReasoning',
      hideReasoning: 'Chat.Message.HideReasoning',
      loadMoreReasoning: 'Chat.Message.LoadMoreReasoning',
      reasoningLoadFailed: 'Chat.Message.ReasoningLoadFailed',
      askQuestion: {
        answerPlaceholder: 'Chat.AskQuestion.AnswerPlaceholder',
        submit: 'Chat.AskQuestion.Submit',
        confirmSelection: 'Chat.AskQuestion.ConfirmSelection',
        answered: 'Chat.AskQuestion.Answered',
      },
    });
    expect(labels.toolCall('search')).toContain('Chat.Message.ToolCall');
    expect(labels.truncated(42, 'detail')).toContain('Chat.Message.Truncated');
  });

  it('awaits the Desktop ask-question IPC port with the exact question identity', async () => {
    const resolveAskQuestion = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.service, 'agentInstance', {
      configurable: true,
      value: { resolveAskQuestion },
    });

    await expect(resolveDesktopAskQuestion('agent-1', 'question-1', 'Approach A')).resolves.toBeUndefined();
    expect(resolveAskQuestion).toHaveBeenCalledWith('agent-1', 'question-1', 'Approach A');
  });

  it('survives the StrictMode lifecycle probe and disposes only replaced or unmounted sessions', async () => {
    lifecycle.sessions.length = 0;
    lifecycle.sessionOptions.length = 0;
    lifecycle.timelines.length = 0;
    const first = tab('agent-1');
    const view = render(
      <StrictMode>
        <DesktopAgentChatTab tab={first} />
      </StrictMode>,
    );
    expect(lifecycle.sessions).toHaveLength(2);
    expect(lifecycle.timelines).toHaveLength(2);
    const committedSession = lifecycle.sessions[0];
    const committedTimeline = lifecycle.timelines[0];
    expect(lifecycle.sessions[1]?.start).not.toHaveBeenCalled();
    expect(committedSession.start).toHaveBeenCalledTimes(2);
    expect(committedSession.start).toHaveBeenLastCalledWith({ agentId: 'agent-1', conversationId: 'agent-1' });
    expect(committedTimeline.dispose).not.toHaveBeenCalled();
    expect(lifecycle.sessionOptions[0]).not.toHaveProperty('maxResidentMessages');
    expect(lifecycle.sessionOptions[0]).not.toHaveProperty('maxResidentBytes');

    view.rerender(
      <StrictMode>
        <DesktopAgentChatTab tab={{ ...first, agentId: 'agent-2' }} />
      </StrictMode>,
    );
    await new Promise<void>(resolve => {
      queueMicrotask(resolve);
    });
    expect(committedSession.stop).toHaveBeenCalledTimes(3);
    expect(committedTimeline.dispose).toHaveBeenCalledOnce();
    expect(lifecycle.sessions).toHaveLength(4);
    expect(lifecycle.timelines).toHaveLength(4);
    const replacementIndex = lifecycle.sessions.findIndex((session, index) => index >= 2 && session.start.mock.calls.length > 0);
    expect(replacementIndex).toBeGreaterThanOrEqual(2);

    view.unmount();
    await new Promise<void>(resolve => {
      queueMicrotask(resolve);
    });
    expect(lifecycle.sessions[replacementIndex]?.stop).toHaveBeenCalledTimes(
      lifecycle.sessions[replacementIndex].start.mock.calls.length + 1,
    );
    expect(lifecycle.timelines[replacementIndex]?.dispose).toHaveBeenCalledOnce();
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
