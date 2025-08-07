/**
 * Tests for MessageBubble component - specifically testing duration-based graying out functionality
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';

import { AgentInstanceMessage } from '@/services/agentInstance/interface';
import { MessageBubble } from '../MessageBubble';

// Mock the agent chat store
const mockMessages = new Map<string, AgentInstanceMessage>();
const mockOrderedMessageIds: string[] = [];
const mockStreamingMessageIds = new Set<string>();

vi.mock('../../../Agent/store/agentChatStore', () => ({
  useAgentChatStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      messages: mockMessages,
      orderedMessageIds: mockOrderedMessageIds,
      streamingMessageIds: mockStreamingMessageIds,
      getMessageById: (id: string) => mockMessages.get(id),
      isMessageStreaming: (id: string) => mockStreamingMessageIds.has(id),
    };
    return selector(state);
  }),
}));

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

describe('MessageBubble - Duration-based Graying', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages.clear();
    mockOrderedMessageIds.length = 0;
    mockStreamingMessageIds.clear();
  });

  it('should show AI tool call message as grayed out when duration=1', () => {
    // Setup messages with AI tool call having duration=1
    const userMessage: AgentInstanceMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Help me search for something',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: undefined, // User messages don't expire
    };

    const aiToolCallMessage: AgentInstanceMessage = {
      id: 'ai-tool-call',
      role: 'assistant',
      content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki", "filter": "[tag[test]]"}</tool_use>',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: 1, // Should be grayed out after one round
      metadata: {
        containsToolCall: true,
        toolId: 'wiki-search',
      },
    };

    const toolResultMessage: AgentInstanceMessage = {
      id: 'tool-result',
      role: 'user',
      content: '<functions_result>Tool: wiki-search\nResult: Found some content</functions_result>',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: 1, // Tool results also expire
      metadata: {
        isToolResult: true,
        toolId: 'wiki-search',
      },
    };

    const finalAiMessage: AgentInstanceMessage = {
      id: 'ai-final',
      role: 'assistant',
      content: 'Based on the search results, here is the information you requested...',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: undefined, // Final response doesn't expire
    };

    // Setup store state
    mockMessages.set('user-1', userMessage);
    mockMessages.set('ai-tool-call', aiToolCallMessage);
    mockMessages.set('tool-result', toolResultMessage);
    mockMessages.set('ai-final', finalAiMessage);
    mockOrderedMessageIds.push('user-1', 'ai-tool-call', 'tool-result', 'ai-final');

    // Render the AI tool call message (index 1 out of 4 total messages)
    render(
      <TestWrapper>
        <MessageBubble messageId='ai-tool-call' />
      </TestWrapper>,
    );

    // Check that the message is rendered
    expect(screen.getByText(/wiki-search/)).toBeInTheDocument();

    // Get the bubble container and check if it has the grayed out styling
    const bubbleContainer = screen.getByText(/wiki-search/).closest('[data-testid="message-bubble"]') ||
      screen.getByText(/wiki-search/).parentElement?.parentElement;

    expect(bubbleContainer).toHaveStyle({ opacity: '0.5' }); // Should be grayed out due to duration=1
  });

  it('should show tool result message as grayed out when duration=1', () => {
    // Setup messages where tool result has duration=1
    const userMessage: AgentInstanceMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Help me search for something',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: undefined,
    };

    const toolResultMessage: AgentInstanceMessage = {
      id: 'tool-result',
      role: 'user',
      content: '<functions_result>Tool: wiki-search\nResult: Found some content</functions_result>',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: 1, // Should be grayed out
      metadata: {
        isToolResult: true,
        toolId: 'wiki-search',
      },
    };

    const finalAiMessage: AgentInstanceMessage = {
      id: 'ai-final',
      role: 'assistant',
      content: 'Based on the search results...',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: undefined,
    };

    // Setup store state
    mockMessages.set('user-1', userMessage);
    mockMessages.set('tool-result', toolResultMessage);
    mockMessages.set('ai-final', finalAiMessage);
    mockOrderedMessageIds.push('user-1', 'tool-result', 'ai-final');

    // Render the tool result message (index 1 out of 3 total messages)
    render(
      <TestWrapper>
        <MessageBubble messageId='tool-result' />
      </TestWrapper>,
    );

    // Check that the message is rendered
    expect(screen.getByText(/functions_result/)).toBeInTheDocument();

    // Get the bubble container and check if it has the grayed out styling
    const bubbleContainer = screen.getByText(/functions_result/).closest('[data-testid="message-bubble"]') ||
      screen.getByText(/functions_result/).parentElement?.parentElement;

    expect(bubbleContainer).toHaveStyle({ opacity: '0.5' }); // Should be grayed out due to duration=1
  });

  it('should show messages without duration as normal (not grayed out)', () => {
    const userMessage: AgentInstanceMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Regular user message',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: undefined, // No duration, should not be grayed out
    };

    const aiMessage: AgentInstanceMessage = {
      id: 'ai-1',
      role: 'assistant',
      content: 'Regular AI response',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: undefined, // No duration, should not be grayed out
    };

    // Setup store state
    mockMessages.set('user-1', userMessage);
    mockMessages.set('ai-1', aiMessage);
    mockOrderedMessageIds.push('user-1', 'ai-1');

    // Render the user message
    render(
      <TestWrapper>
        <MessageBubble messageId='user-1' />
      </TestWrapper>,
    );

    // Check that the message is rendered
    expect(screen.getByText('Regular user message')).toBeInTheDocument();

    // Get the bubble container and check that it's not grayed out
    const bubbleContainer = screen.getByText('Regular user message').closest('[data-testid="message-bubble"]') ||
      screen.getByText('Regular user message').parentElement?.parentElement;

    expect(bubbleContainer).toHaveStyle({ opacity: '1' }); // Should NOT be grayed out
  });

  it('should show messages with duration=0 as grayed out immediately', () => {
    const messageWithZeroDuration: AgentInstanceMessage = {
      id: 'zero-duration',
      role: 'assistant',
      content: 'Message with zero duration',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: 0, // Immediately expired
    };

    const laterMessage: AgentInstanceMessage = {
      id: 'later',
      role: 'user',
      content: 'Later message',
      agentId: 'test-agent',
      contentType: 'text/plain',
      modified: new Date(),
      duration: undefined,
    };

    // Setup store state
    mockMessages.set('zero-duration', messageWithZeroDuration);
    mockMessages.set('later', laterMessage);
    mockOrderedMessageIds.push('zero-duration', 'later');

    // Render the zero duration message
    render(
      <TestWrapper>
        <MessageBubble messageId='zero-duration' />
      </TestWrapper>,
    );

    // Check that the message is rendered
    expect(screen.getByText('Message with zero duration')).toBeInTheDocument();

    // Get the bubble container and check if it has the grayed out styling
    const bubbleContainer = screen.getByText('Message with zero duration').closest('[data-testid="message-bubble"]') ||
      screen.getByText('Message with zero duration').parentElement?.parentElement;

    expect(bubbleContainer).toHaveStyle({ opacity: '0.5' }); // Should be grayed out due to duration=0
  });

  it('should correctly calculate graying for messages with mixed durations', () => {
    // Setup multiple messages with different duration values
    const messages: AgentInstanceMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Message 1 - no duration',
        agentId: 'test-agent',
        contentType: 'text/plain',
        modified: new Date(),
        duration: undefined, // Should not be grayed
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Message 2 - duration 3',
        agentId: 'test-agent',
        contentType: 'text/plain',
        modified: new Date(),
        duration: 3, // Should not be grayed (roundsFromCurrent=2 < duration=3)
      },
      {
        id: 'msg-3',
        role: 'user',
        content: 'Message 3 - duration 1',
        agentId: 'test-agent',
        contentType: 'text/plain',
        modified: new Date(),
        duration: 1, // Should be grayed (roundsFromCurrent=1 >= duration=1)
      },
      {
        id: 'msg-4',
        role: 'assistant',
        content: 'Message 4 - latest',
        agentId: 'test-agent',
        contentType: 'text/plain',
        modified: new Date(),
        duration: undefined, // Should not be grayed
      },
    ];

    // Setup store state
    for (const msg of messages) {
      mockMessages.set(msg.id, msg);
    }
    mockOrderedMessageIds.push('msg-1', 'msg-2', 'msg-3', 'msg-4');

    // Test message with duration=3 (should not be grayed out)
    const { rerender } = render(
      <TestWrapper>
        <MessageBubble messageId='msg-2' />
      </TestWrapper>,
    );

    expect(screen.getByText('Message 2 - duration 3')).toBeInTheDocument();
    let bubbleContainer = screen.getByText('Message 2 - duration 3').closest('[data-testid="message-bubble"]') ||
      screen.getByText('Message 2 - duration 3').parentElement?.parentElement;
    expect(bubbleContainer).toHaveStyle({ opacity: '1' }); // Should NOT be grayed out

    // Test message with duration=1 (should be grayed out)
    rerender(
      <TestWrapper>
        <MessageBubble messageId='msg-3' />
      </TestWrapper>,
    );

    expect(screen.getByText('Message 3 - duration 1')).toBeInTheDocument();
    bubbleContainer = screen.getByText('Message 3 - duration 1').closest('[data-testid="message-bubble"]') ||
      screen.getByText('Message 3 - duration 1').parentElement?.parentElement;
    expect(bubbleContainer).toHaveStyle({ opacity: '0.5' }); // Should be grayed out
  });
});
