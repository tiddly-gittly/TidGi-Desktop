/**
 * Comprehensive tests for MessageRenderer components:
 * - AskQuestionRenderer: single-select, multi-select, text, freeform, answered state
 * - ToolResultRenderer: generic <functions_result> rendering
 * - ToolApprovalRenderer: approval buttons
 * - BaseMessageRenderer: XML stripping
 * - MessageRenderer index: pattern matching & routing
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import type { AgentInstanceMessage } from '@/services/agentInstance/interface';

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

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
);

function makeMessage(overrides: Partial<AgentInstanceMessage>): AgentInstanceMessage {
  return {
    id: 'msg-1',
    agentId: 'agent-1',
    role: 'tool',
    content: '',
    modified: new Date(),
    ...overrides,
  };
}

// ── BaseMessageRenderer ────────────────────────────────────────────────

describe('BaseMessageRenderer', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let BaseMessageRenderer: typeof import('../BaseMessageRenderer').BaseMessageRenderer;

  beforeEach(async () => {
    const mod = await import('../BaseMessageRenderer');
    BaseMessageRenderer = mod.BaseMessageRenderer;
  });

  it('should render plain text content', () => {
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content: 'Hello world' })} isUser={false} /></Wrapper>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('should strip <tool_use> XML from content', () => {
    const content = 'Let me search for that. <tool_use name="wiki-search">{"query":"test"}</tool_use>';
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(screen.getByText('Let me search for that.')).toBeInTheDocument();
    expect(screen.queryByText(/tool_use/)).not.toBeInTheDocument();
  });

  it('should strip <function_call> XML from content', () => {
    const content = '<function_call name="foo">{"x":1}</function_call>';
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(screen.queryByText(/function_call/)).not.toBeInTheDocument();
  });

  it('should strip <parallel_tool_calls> wrapper', () => {
    const content = 'Searching... <parallel_tool_calls><tool_use name="a">{}</tool_use><tool_use name="b">{}</tool_use></parallel_tool_calls>';
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(screen.getByText('Searching...')).toBeInTheDocument();
    expect(screen.queryByText(/parallel_tool_calls/)).not.toBeInTheDocument();
  });

  it('should strip <functions_result> blocks', () => {
    const content = '<functions_result>\nTool: wiki-search\nResult: found 3 results\n</functions_result>';
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(screen.queryByText(/functions_result/)).not.toBeInTheDocument();
  });

  it('should return null for content that is entirely tool XML', () => {
    const content = '<tool_use name="ask-question">{"question":"test?"}</tool_use>';
    const { container } = render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(container.firstChild).toBeNull();
  });

  it('should strip partial/unclosed <tool_use> during streaming', () => {
    const content = 'Searching now. <tool_use name="wiki-search">{"filter":"[title';
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(screen.getByText('Searching now.')).toBeInTheDocument();
    expect(screen.queryByText(/tool_use/)).not.toBeInTheDocument();
  });

  it('should strip partial/unclosed <functions_result> during streaming', () => {
    const content = '<functions_result>\nTool: wiki-search\nResult: partial';
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(screen.queryByText(/functions_result/)).not.toBeInTheDocument();
  });

  it('should strip incomplete opening tag at end of content', () => {
    const content = 'Let me do this. <tool_use name="wiki';
    render(<Wrapper><BaseMessageRenderer message={makeMessage({ content })} isUser={false} /></Wrapper>);
    expect(screen.getByText('Let me do this.')).toBeInTheDocument();
    expect(screen.queryByText(/tool_use/)).not.toBeInTheDocument();
  });
});

// ── AskQuestionRenderer ────────────────────────────────────────────────

describe('AskQuestionRenderer', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let AskQuestionRenderer: typeof import('../AskQuestionRenderer').AskQuestionRenderer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../AskQuestionRenderer');
    AskQuestionRenderer = mod.AskQuestionRenderer;
  });

  const makeAskQuestionMessage = (data: Record<string, unknown>): AgentInstanceMessage =>
    makeMessage({
      content: `<functions_result>\nTool: ask-question\nParameters: {}\nResult: ${JSON.stringify(data)}\n</functions_result>`,
    });

  describe('single-select (default)', () => {
    it('should render question text and options as chips', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Which workspace?',
        options: [{ label: 'Wiki A' }, { label: 'Wiki B' }],
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      expect(screen.getByText('Which workspace?')).toBeInTheDocument();
      expect(screen.getByText('Wiki A')).toBeInTheDocument();
      expect(screen.getByText('Wiki B')).toBeInTheDocument();
    });

    it('should send option label when chip is clicked', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Pick one',
        options: [{ label: 'Option 1' }],
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      fireEvent.click(screen.getByText('Option 1'));
      expect(mockSendMessage).toHaveBeenCalledWith('Option 1');
    });

    it('should remove options from DOM after answering', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Pick one',
        options: [{ label: 'A' }, { label: 'B' }],
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      fireEvent.click(screen.getByText('A'));
      // After clicking, "Answer submitted" text appears
      expect(screen.getByText(/Answer submitted/)).toBeInTheDocument();
      // Options should be removed from DOM (not just disabled)
      expect(screen.queryByTestId('ask-question-option-0')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ask-question-option-1')).not.toBeInTheDocument();
    });

    it('should show freeform text input when allowFreeform is true', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Pick or type',
        options: [{ label: 'X' }],
        allowFreeform: true,
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      expect(screen.getByTestId('ask-question-freeform')).toBeInTheDocument();
    });

    it('should NOT show freeform input when allowFreeform is false', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Only options',
        options: [{ label: 'X' }],
        allowFreeform: false,
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      expect(screen.queryByTestId('ask-question-freeform')).not.toBeInTheDocument();
    });
  });

  describe('multi-select', () => {
    it('should render checkboxes for options', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Select tags',
        inputType: 'multi-select',
        options: [{ label: 'journal' }, { label: 'important' }],
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      expect(screen.getByTestId('ask-question-multiselect')).toBeInTheDocument();
      expect(screen.getByText('journal')).toBeInTheDocument();
      expect(screen.getByText('important')).toBeInTheDocument();
    });

    it('should send comma-separated values when submitted', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Select tags',
        inputType: 'multi-select',
        options: [{ label: 'journal' }, { label: 'important' }, { label: 'todo' }],
        allowFreeform: true,
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      // Check two checkboxes
      fireEvent.click(screen.getByTestId('ask-question-checkbox-0'));
      fireEvent.click(screen.getByTestId('ask-question-checkbox-2'));
      // Click submit
      fireEvent.click(screen.getByTestId('ask-question-submit'));
      expect(mockSendMessage).toHaveBeenCalledWith('journal, todo');
    });
  });

  describe('text input', () => {
    it('should show only text input with no options', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Describe changes',
        inputType: 'text',
      });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      expect(screen.getByTestId('ask-question-text-input')).toBeInTheDocument();
      expect(screen.queryByTestId('ask-question-options')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ask-question-multiselect')).not.toBeInTheDocument();
    });
  });

  describe('answered state persistence', () => {
    it('should initialize answered=true from metadata', () => {
      const msg = makeAskQuestionMessage({
        type: 'ask-question',
        question: 'Already answered',
        options: [{ label: 'A' }],
      });
      msg.metadata = { askQuestionAnswered: true };
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      expect(screen.getByText(/Answer submitted/)).toBeInTheDocument();
    });
  });

  describe('fallback', () => {
    it('should render raw content when JSON is unparseable', () => {
      const msg = makeMessage({ content: 'not json content' });
      render(<Wrapper><AskQuestionRenderer message={msg} isUser={false} /></Wrapper>);
      expect(screen.getByText('not json content')).toBeInTheDocument();
    });
  });
});

// ── ToolResultRenderer ─────────────────────────────────────────────────

describe('ToolResultRenderer', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let ToolResultRenderer: typeof import('../ToolResultRenderer').ToolResultRenderer;

  beforeEach(async () => {
    const mod = await import('../ToolResultRenderer');
    ToolResultRenderer = mod.ToolResultRenderer;
  });

  it('should render tool name and result preview', () => {
    const msg = makeMessage({
      content: '<functions_result>\nTool: wiki-search\nParameters: {"query":"test"}\nResult: Found 5 tiddlers matching "test"\n</functions_result>',
    });
    render(<Wrapper><ToolResultRenderer message={msg} isUser={false} /></Wrapper>);
    expect(screen.getByText('wiki-search')).toBeInTheDocument();
    expect(screen.getAllByText(/Found 5 tiddlers/).length).toBeGreaterThan(0);
  });

  it('should show error styling when result is an error', () => {
    const msg = makeMessage({
      content: '<functions_result>\nTool: wiki-search\nParameters: {}\nError: Workspace not found\n</functions_result>',
    });
    render(<Wrapper><ToolResultRenderer message={msg} isUser={false} /></Wrapper>);
    expect(screen.getByText('wiki-search')).toBeInTheDocument();
    expect(screen.getAllByText(/Workspace not found/).length).toBeGreaterThan(0);
  });

  it('should truncate long results in collapsed view', () => {
    const longResult = 'A'.repeat(300);
    const msg = makeMessage({
      content: `<functions_result>\nTool: test-tool\nParameters: {}\nResult: ${longResult}\n</functions_result>`,
    });
    render(<Wrapper><ToolResultRenderer message={msg} isUser={false} /></Wrapper>);
    // Collapsed view should show truncated result
    expect(screen.getByText(/A{50,}…/)).toBeInTheDocument();
  });

  it('should expand to show full content when clicked', () => {
    const msg = makeMessage({
      content: '<functions_result>\nTool: test-tool\nParameters: {"foo":"bar"}\nResult: Full result text here\n</functions_result>',
    });
    render(<Wrapper><ToolResultRenderer message={msg} isUser={false} /></Wrapper>);
    // Click header to expand
    fireEvent.click(screen.getByText('test-tool'));
    // Parameters should now be visible
    expect(screen.getByText('{"foo":"bar"}')).toBeInTheDocument();
  });
});

// ── ToolApprovalRenderer ───────────────────────────────────────────────

describe('ToolApprovalRenderer', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let ToolApprovalRenderer: typeof import('../ToolApprovalRenderer').ToolApprovalRenderer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../ToolApprovalRenderer');
    ToolApprovalRenderer = mod.ToolApprovalRenderer;
  });

  const makeApprovalMessage = (): AgentInstanceMessage =>
    makeMessage({
      content: `<functions_result>\nTool: tool-approval\nParameters: {}\nResult: ${JSON.stringify({
        type: 'tool-approval',
        approvalId: 'approval-123',
        toolName: 'zx-script',
        description: 'Execute shell command: ls -la',
        parameters: { command: 'ls -la' },
      })}\n</functions_result>`,
    });

  it('should render approval request with tool name and parameters', () => {
    render(<Wrapper><ToolApprovalRenderer message={makeApprovalMessage()} isUser={false} /></Wrapper>);
    expect(screen.getByText(/zx-script/)).toBeInTheDocument();
    expect(screen.getByText(/ls -la/)).toBeInTheDocument();
  });

  it('should call resolveToolApproval with allow when approved', () => {
    render(<Wrapper><ToolApprovalRenderer message={makeApprovalMessage()} isUser={false} /></Wrapper>);
    const allowButton = screen.getByText(/Allow/i);
    fireEvent.click(allowButton);
    expect(window.service.agentInstance.resolveToolApproval).toHaveBeenCalledWith('approval-123', 'allow');
  });

  it('should call resolveToolApproval with deny when denied', () => {
    render(<Wrapper><ToolApprovalRenderer message={makeApprovalMessage()} isUser={false} /></Wrapper>);
    const denyButton = screen.getByText(/Deny/i);
    fireEvent.click(denyButton);
    expect(window.service.agentInstance.resolveToolApproval).toHaveBeenCalledWith('approval-123', 'deny');
  });
});

// ── MessageRenderer pattern routing ────────────────────────────────────

describe('MessageRenderer - Pattern Routing', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
    render(<Wrapper><MessageRenderer message={msg} isUser={false} /></Wrapper>);
    expect(screen.getByText('Test?')).toBeInTheDocument();
  });

  it('should route generic tool result to ToolResultRenderer', () => {
    const msg = makeMessage({
      role: 'tool',
      content: '<functions_result>\nTool: wiki-search\nParameters: {}\nResult: Found stuff\n</functions_result>',
    });
    render(<Wrapper><MessageRenderer message={msg} isUser={false} /></Wrapper>);
    expect(screen.getByText('wiki-search')).toBeInTheDocument();
  });

  it('should use BaseMessageRenderer for user messages', () => {
    const msg = makeMessage({ role: 'user', content: 'Hello agent' });
    render(<Wrapper><MessageRenderer message={msg} isUser={true} /></Wrapper>);
    expect(screen.getByText('Hello agent')).toBeInTheDocument();
  });
});
