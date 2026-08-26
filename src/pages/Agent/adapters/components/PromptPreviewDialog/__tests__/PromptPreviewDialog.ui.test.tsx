/**
 * Tests for PromptPreviewDialog component
 * Testing tool information rendering for wikiOperationPlugin, wikiSearchPlugin, workspacesListPlugin
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { getBuiltinLoopProfiles, PromptPreviewAuditSessionStore } from 'memeloop';
import type { PromptPreviewController, PromptPreviewDialogState } from 'memeloop';

import { PromptPreviewDialog } from '../index';
import { PreviewTabsView } from '../PreviewTabsView';

const defaultAgents = getBuiltinLoopProfiles();

// Mock handler config management hook
vi.mock('@/windows/Preferences/sections/ExternalAPI/useAgentFrameworkConfigManagement', () => ({
  useAgentFrameworkConfigManagement: vi.fn(() => ({
    loading: false,
    config: defaultAgents[0].agentFrameworkConfig,
    setConfig: vi.fn(),
    persistConfig: vi.fn(),
    handleConfigChange: vi.fn(),
  })),
}));

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

describe('PromptPreviewDialog - Tool Information Rendering', () => {
  beforeEach(async () => {
    // Clear all mock calls
    vi.clearAllMocks();

    // Initialize real AgentInstance observables for testing actual plugin execution
  });

  it('should render dialog when open=true', async () => {
    render(
      <TestWrapper>
        <PromptPreviewDialog
          agentId='conversation'
          agentDefinitionId='definition'
          state={previewState({
            result: {
              flatPrompts: [],
              processedPrompts: [],
              audit: auditExecution(),
            },
          })}
          controller={previewController()}
          open={true}
          onClose={vi.fn()}
          inputText='test input'
        />
      </TestWrapper>,
    );

    // Check dialog title is visible
    expect(screen.getByText(/Prompt.*Preview/)).toBeInTheDocument();

    // Check that tabs are visible (labels come from translation keys)
    expect(screen.getByRole('tab', { name: /Tree/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Flat/ })).toBeInTheDocument();
  });

  // IMPROVED: Example of testing with state changes using real store
  it('should handle loading states properly', async () => {
    vi.useFakeTimers();

    const controller = previewController();
    const { rerender } = render(
      <TestWrapper>
        <PromptPreviewDialog
          agentId='conversation'
          agentDefinitionId='definition'
          state={previewState({ loading: true, progress: 0.5, currentStep: 'starting' })}
          controller={controller}
          open={true}
          onClose={vi.fn()}
          inputText='test input'
        />
      </TestWrapper>,
    );

    // PreviewProgressBar is debounced to avoid flashing
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Should show loading indicator via visible text
    expect(screen.getByText('Prompt.Progress.Starting')).toBeInTheDocument();
    expect(screen.getByText('Prompt.Progress.LivePreview')).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <PromptPreviewDialog
          agentId='conversation'
          agentDefinitionId='definition'
          state={previewState({ loading: false, progress: 1, currentStep: 'complete' })}
          controller={controller}
          open={true}
          onClose={vi.fn()}
          inputText='test input'
        />
      </TestWrapper>,
    );
    expect(screen.queryByText('Prompt.Progress.LivePreview')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('renders the exact execution request with compaction, history, current input, and provider route', async () => {
    const user = userEvent.setup();
    const controller = previewController();
    const state = previewState({
      activeTab: 'flat',
      result: {
        flatPrompts: [{ role: 'system', content: 'renderer approximation must not win' }],
        processedPrompts: [],
        audit: auditExecution(),
      },
    });
    render(
      <TestWrapper>
        <PreviewTabsView isFullScreen={false} state={state} controller={controller} />
      </TestWrapper>,
    );

    for (
      const exactContent of [
        'system exact',
        'durable compaction one',
        'historical user turn',
        'historical assistant turn',
        'current unsent input',
      ]
    ) {
      expect(screen.getByText(exactContent)).toBeInTheDocument();
    }
    expect(screen.queryByText('renderer approximation must not win')).not.toBeInTheDocument();
    expect(screen.getByText(/Prompt.MessageCount.*4/u)).toBeInTheDocument();
    expect(screen.getByText(/Prompt.CompactionSummaryCount.*2/u)).toBeInTheDocument();

    const modelRequestButton = screen.getByRole('button', { name: 'Prompt.ModelRequest' });
    expect(modelRequestButton).toBeEnabled();
    await user.click(modelRequestButton);
    await waitFor(() => {
      expect(controller.getAuditDetail).toHaveBeenCalledOnce();
    });
    const exactRequest = await screen.findByTestId('prompt-preview-audit-detail');
    expect(exactRequest).toHaveTextContent('provider-exact');
    expect(exactRequest).toHaveTextContent('logical-exact');
    expect(exactRequest).toHaveTextContent('wire-exact');
    expect(exactRequest).toHaveTextContent('responses');
  });
});

function previewState(overrides: Partial<PromptPreviewDialogState> = {}): PromptPreviewDialogState {
  return {
    open: true,
    baseMode: 'preview',
    activeTab: 'tree',
    loading: false,
    progress: 0,
    currentStep: 'idle',
    currentStepDisplay: null,
    currentPlugin: null,
    result: null,
    lastUpdated: null,
    formFieldsToScrollTo: [],
    ...overrides,
  };
}

function previewController(): PromptPreviewController {
  return {
    generate: vi.fn(async () => null),
    getAuditPage: vi.fn(async () => auditExecution().initialPage),
    getAuditDetail: vi.fn(async request => ({
      sessionId: request.sessionId,
      revision: request.expectedRevision,
      target: request.target,
      canonicalUtf8: new TextEncoder().encode(
        '{"apiMode":"responses","logicalModelId":"logical-exact","providerId":"provider-exact","wireModelId":"wire-exact"}',
      ),
      complete: true,
    })),
    setActiveTab: vi.fn(),
    setFormFieldsToScrollTo: vi.fn(),
  } as unknown as PromptPreviewController;
}

function auditExecution() {
  const store = new PromptPreviewAuditSessionStore({
    createSessionId: () => 'session-ui',
    createRevision: () => 'revision-ui',
  });
  const execution = store.createSession({
    request: {
      providerId: 'provider-exact',
      modelId: 'wire-exact',
      logicalModelId: 'logical-exact',
      wireModelId: 'wire-exact',
      apiMode: 'responses',
      messages: [
        { role: 'system', content: 'system exact' },
        { role: 'assistant', content: 'durable compaction one' },
        { role: 'user', content: 'historical user turn' },
        { role: 'assistant', content: 'historical assistant turn' },
        { role: 'user', content: 'current unsent input' },
      ],
    },
    sources: [
      'system',
      'context-compaction-summary',
      'conversation-message',
      'conversation-message',
      'preview-input',
    ],
    compactionSummaryCount: 2,
  });
  return { ...execution, contextStats: { messageCount: 4, compactionSummaryCount: 2 } };
}
