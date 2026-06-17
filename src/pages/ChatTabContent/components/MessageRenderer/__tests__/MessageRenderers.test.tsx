/**
 * Comprehensive tests for MessageRenderer components:
 * - AskQuestionRenderer: single-select, multi-select, text, freeform, answered state
 * - ToolResultRenderer: generic <functions_result> rendering
 * - ToolApprovalRenderer: approval buttons
 * - BaseMessageRenderer: XML stripping
 * - MessageRenderer index: pattern matching & routing
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemeLoopRuntimeProvider } from '@memeloop/react-ui/chat';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import type { ChatMessage } from 'memeloop';

// ── mocks ──────────────────────────────────────────────────────────────

const mockSendMessage = vi.fn();

vi.mock('../../../../Agent/store/agentChatStore', () => ({
  useAgentChatStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      sendMessage: mockSendMessage,
      isMessageStreaming: () => false,
    };
    return selector(state);
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock the wiki hooks for WikitextMessageRenderer
vi.mock('@services/wiki/hooks', () => ({
  useRenderWikiText: () => '',
}));

// Mock window.service for renderers that call IPC
Object.defineProperty(window, 'service', {
  value: {
    agentInstance: {
      debounceUpdateMessage: vi.fn(),
      resolveToolApproval: vi.fn(),
    },
  },
  writable: true,
});

const mockAdapter = {
  messages: [],
  isRunning: false,
  isLoading: false,
  error: null,
  sendMessage: vi.fn(),
  cancel: vi.fn(),
  deleteTurn: vi.fn(),
  retryTurn: vi.fn(),
  resolveAskQuestion: vi.fn(),
  updateMessage: vi.fn(),
};

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    <MemeLoopRuntimeProvider adapter={mockAdapter}>{children}</MemeLoopRuntimeProvider>
  </ThemeProvider>
);

function makeMessage(overrides: Partial<ChatMessage> & { id?: string; agentId?: string; modified?: Date }): ChatMessage {
  return {
    messageId: 'msg-1',
    conversationId: 'agent-1',
    originNodeId: 'tidgi-desktop',
    timestamp: Date.now(),
    lamportClock: Date.now(),
    role: 'tool',
    content: '',
    metadata: {
      agentId: overrides.agentId ?? 'agent-1',
    },
    ...overrides,
  };
}

// ── BaseMessageRenderer ────────────────────────────────────────────────

describe('BaseMessageRenderer', () => {
  let BaseMessageRenderer: typeof import('../BaseMessageRenderer').BaseMessageRenderer;

  beforeEach(async () => {
    const mod = await import('../BaseMessageRenderer');
    BaseMessageRenderer = mod.BaseMessageRenderer;
  });

  it('should render plain text content', () => {
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content: 'Hello world' })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('should strip <tool_use> XML from content', () => {
    const content = 'Let me search for that. <tool_use name="wiki-search">{"query":"test"}</tool_use>';
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Let me search for that.')).toBeInTheDocument();
    expect(screen.queryByText(/tool_use/)).not.toBeInTheDocument();
  });

  it('should strip <function_call> XML from content', () => {
    const content = '<function_call name="foo">{"x":1}</function_call>';
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.queryByText(/function_call/)).not.toBeInTheDocument();
  });

  it('should strip <parallel_tool_calls> wrapper', () => {
    const content = 'Searching... <parallel_tool_calls><tool_use name="a">{}</tool_use><tool_use name="b">{}</tool_use></parallel_tool_calls>';
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Searching...')).toBeInTheDocument();
    expect(screen.queryByText(/parallel_tool_calls/)).not.toBeInTheDocument();
  });

  it('should strip <functions_result> blocks', () => {
    const content = '<functions_result>\nTool: wiki-search\nResult: found 3 results\n</functions_result>';
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.queryByText(/functions_result/)).not.toBeInTheDocument();
  });

  it('should return null for content that is entirely tool XML', () => {
    const content = '<tool_use name="ask-question">{"question":"test?"}</tool_use>';
    const { container } = render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should strip partial/unclosed <tool_use> during streaming', () => {
    const content = 'Searching now. <tool_use name="wiki-search">{"filter":"[title';
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Searching now.')).toBeInTheDocument();
    expect(screen.queryByText(/tool_use/)).not.toBeInTheDocument();
  });

  it('should strip partial/unclosed <functions_result> during streaming', () => {
    const content = '<functions_result>\nTool: wiki-search\nResult: partial';
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.queryByText(/functions_result/)).not.toBeInTheDocument();
  });

  it('should strip incomplete opening tag at end of content', () => {
    const content = 'Let me do this. <tool_use name="wiki';
    render(
      <Wrapper>
        <BaseMessageRenderer message={makeMessage({ content })} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Let me do this.')).toBeInTheDocument();
    expect(screen.queryByText(/tool_use/)).not.toBeInTheDocument();
  });
});

// ── AskQuestionRenderer ────────────────────────────────────────────────
// Detailed UI behaviour for ask-question messages now lives upstream in
// @memeloop/react-ui. Desktop only keeps a smoke test to ensure routing and
// adapter wiring still work.

describe('AskQuestionRenderer', () => {
  let AskQuestionRenderer: typeof import('../AskQuestionRenderer').AskQuestionRenderer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../AskQuestionRenderer');
    AskQuestionRenderer = mod.AskQuestionRenderer;
  });

  const makeAskQuestionMessage = (data: Record<string, unknown>): ChatMessage =>
    makeMessage({
      content: `<functions_result>\nTool: ask-question\nParameters: {}\nResult: ${JSON.stringify(data)}\n</functions_result>`,
    });

  it('should render question text and options from upstream AskQuestionContent', () => {
    const msg = makeAskQuestionMessage({
      type: 'ask-question',
      question: 'Which workspace?',
      options: [{ label: 'Wiki A' }, { label: 'Wiki B' }],
    });
    render(
      <Wrapper>
        <AskQuestionRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Which workspace?')).toBeInTheDocument();
    expect(screen.getByText('Wiki A')).toBeInTheDocument();
    expect(screen.getByText('Wiki B')).toBeInTheDocument();
  });

  it('should call adapter.resolveAskQuestion when an option is selected', () => {
    const msg = makeAskQuestionMessage({
      type: 'ask-question',
      questionId: 'q-1',
      question: 'Pick one',
      options: [{ label: 'Option 1' }],
    });
    render(
      <Wrapper>
        <AskQuestionRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('Option 1'));
    expect(mockAdapter.resolveAskQuestion).toHaveBeenCalledWith('q-1', 'Option 1');
  });
});

// ── ToolResultRenderer ─────────────────────────────────────────────────

describe('ToolResultRenderer', () => {
  let ToolResultRenderer: typeof import('../ToolResultRenderer').ToolResultRenderer;

  beforeEach(async () => {
    const mod = await import('../ToolResultRenderer');
    ToolResultRenderer = mod.ToolResultRenderer;
  });

  it('should render tool name and result preview', () => {
    const msg = makeMessage({
      content: '<functions_result>\nTool: wiki-search\nParameters: {"query":"test"}\nResult: Found 5 tiddlers matching "test"\n</functions_result>',
    });
    render(
      <Wrapper>
        <ToolResultRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('wiki-search')).toBeInTheDocument();
    expect(screen.getAllByText(/Found 5 tiddlers/).length).toBeGreaterThan(0);
  });

  it('should show error styling when result is an error', () => {
    const msg = makeMessage({
      content: '<functions_result>\nTool: wiki-search\nParameters: {}\nError: Workspace not found\n</functions_result>',
    });
    render(
      <Wrapper>
        <ToolResultRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('wiki-search')).toBeInTheDocument();
    expect(screen.getAllByText(/Workspace not found/).length).toBeGreaterThan(0);
  });

  it('should truncate long results in collapsed view', () => {
    const longResult = 'A'.repeat(300);
    const msg = makeMessage({
      content: `<functions_result>\nTool: test-tool\nParameters: {}\nResult: ${longResult}\n</functions_result>`,
    });
    render(
      <Wrapper>
        <ToolResultRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    // Collapsed view should show truncated result
    expect(screen.getByText(/A{50,}…/)).toBeInTheDocument();
  });

  it('should expand to show full content when clicked', () => {
    const msg = makeMessage({
      content: '<functions_result>\nTool: test-tool\nParameters: {"foo":"bar"}\nResult: Full result text here\n</functions_result>',
    });
    render(
      <Wrapper>
        <ToolResultRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    // Click header to expand
    fireEvent.click(screen.getByText('test-tool'));
    // Parameters should now be visible
    expect(screen.getByText('{"foo":"bar"}')).toBeInTheDocument();
  });
});

// ── ToolApprovalRenderer ───────────────────────────────────────────────

describe('ToolApprovalRenderer', () => {
  let ToolApprovalRenderer: typeof import('../ToolApprovalRenderer').ToolApprovalRenderer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../ToolApprovalRenderer');
    ToolApprovalRenderer = mod.ToolApprovalRenderer;
  });

  const makeApprovalMessage = (): ChatMessage =>
    makeMessage({
      content: `<functions_result>\nTool: tool-approval\nParameters: {}\nResult: ${
        JSON.stringify({
          type: 'tool-approval',
          approvalId: 'approval-123',
          toolName: 'zx-script',
          description: 'Execute shell command: ls -la',
          parameters: { command: 'ls -la' },
        })
      }\n</functions_result>`,
    });

  it('should render approval request with tool name and parameters', () => {
    render(
      <Wrapper>
        <ToolApprovalRenderer message={makeApprovalMessage()} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText(/zx-script/)).toBeInTheDocument();
    expect(screen.getByText(/ls -la/)).toBeInTheDocument();
  });

  it('should call resolveToolApproval with allow when approved', () => {
    render(
      <Wrapper>
        <ToolApprovalRenderer message={makeApprovalMessage()} isUser={false} />
      </Wrapper>,
    );
    const allowButton = screen.getByText(/Allow/i);
    fireEvent.click(allowButton);
    expect(window.service.agentInstance.resolveToolApproval).toHaveBeenCalledWith('approval-123', 'allow');
  });

  it('should call resolveToolApproval with deny when denied', () => {
    render(
      <Wrapper>
        <ToolApprovalRenderer message={makeApprovalMessage()} isUser={false} />
      </Wrapper>,
    );
    const denyButton = screen.getByText(/Deny/i);
    fireEvent.click(denyButton);
    expect(window.service.agentInstance.resolveToolApproval).toHaveBeenCalledWith('approval-123', 'deny');
  });
});

// ── MessageRenderer pattern routing ────────────────────────────────────

describe('MessageRenderer - Pattern Routing', () => {
  let MessageRenderer: typeof import('../index').MessageRenderer;

  beforeEach(async () => {
    const { registerMessageRenderer } = await import('../index');
    const { AskQuestionRenderer } = await import('../AskQuestionRenderer');
    const { ToolResultRenderer } = await import('../ToolResultRenderer');
    registerMessageRenderer('ask-question', {
      pattern: /"type"\s*:\s*"ask-question"/,
      renderer: AskQuestionRenderer,
      priority: 150,
    });
    registerMessageRenderer('tool-result', {
      pattern: /<functions_result>/,
      renderer: ToolResultRenderer,
      priority: 10,
    });

    const mod = await import('../index');
    MessageRenderer = mod.MessageRenderer;
  });

  it('should route ask-question tool result to AskQuestionRenderer', () => {
    const msg = makeMessage({
      role: 'tool',
      content: `<functions_result>\nTool: ask-question\nResult: ${JSON.stringify({ type: 'ask-question', question: 'Test?' })}\n</functions_result>`,
    });
    render(
      <Wrapper>
        <MessageRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Test?')).toBeInTheDocument();
  });

  it('should route generic tool result to ToolResultRenderer', () => {
    const msg = makeMessage({
      role: 'tool',
      content: '<functions_result>\nTool: wiki-search\nParameters: {}\nResult: Found stuff\n</functions_result>',
    });
    render(
      <Wrapper>
        <MessageRenderer message={msg} isUser={false} />
      </Wrapper>,
    );
    expect(screen.getByText('wiki-search')).toBeInTheDocument();
  });

  it('should use BaseMessageRenderer for user messages', () => {
    const msg = makeMessage({ role: 'user', content: 'Hello agent' });
    render(
      <Wrapper>
        <MessageRenderer message={msg} isUser={true} />
      </Wrapper>,
    );
    expect(screen.getByText('Hello agent')).toBeInTheDocument();
  });
});
