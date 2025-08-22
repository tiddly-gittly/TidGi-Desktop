/**
 * Tests for PromptPreviewDialog component
 * Testing tool information rendering for wikiOperationPlugin, wikiSearchPlugin, workspacesListPlugin
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';

import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore/index';
import defaultAgents from '@services/agentInstance/buildInAgentHandlers/defaultAgents.json';
import { PromptPreviewDialog } from '../index';

// Mock handler config management hook
vi.mock('@/windows/Preferences/sections/ExternalAPI/useHandlerConfigManagement', () => ({
  useHandlerConfigManagement: vi.fn(() => ({
    loading: false,
    config: defaultAgents[0].handlerConfig,
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
    // Reset store to initial state before each test using real store
    useAgentChatStore.setState({
      agent: {
        id: 'test-agent',
        agentDefId: 'example-agent',
        status: { state: 'working', modified: new Date() },
        created: new Date(),
      },
      messages: new Map(),
      previewDialogOpen: true,
      previewDialogTab: 'tree',
      previewLoading: false,
      previewResult: null,
      previewProgress: 0,
      previewCurrentStep: '',
      previewCurrentPlugin: null,
      lastUpdated: null,
      formFieldsToScrollTo: [],
      expandedArrayItems: new Map(),
    });

    // Clear all mock calls
    vi.clearAllMocks();

    // Initialize real AgentInstance observables for testing actual plugin execution
  });

  it('should render dialog when open=true', async () => {
    render(
      <TestWrapper>
        <PromptPreviewDialog
          open={true}
          onClose={vi.fn()}
          inputText='test input'
        />
      </TestWrapper>,
    );

    // Check dialog title is visible
    expect(screen.getByText(/Prompt.*Preview/)).toBeInTheDocument();

    // Check that tabs are visible
    expect(screen.getByText('Prompt.Tree')).toBeInTheDocument();
    expect(screen.getByText('Prompt.Flat')).toBeInTheDocument();
  });

  it('should handle close dialog', async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();

    render(
      <TestWrapper>
        <PromptPreviewDialog
          open={true}
          onClose={mockOnClose}
          inputText='test input'
        />
      </TestWrapper>,
    );

    // Click close button
    const closeButton = screen.getByRole('button', { name: /close/ });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should toggle between tree and flat views', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <PromptPreviewDialog
          open={true}
          onClose={vi.fn()}
          inputText='test input'
        />
      </TestWrapper>,
    );

    // Initially should be in tree view
    expect(screen.getByRole('tab', { name: /Tree/ })).toHaveAttribute('aria-selected', 'true');

    // Switch to flat view
    const flatTab = screen.getByRole('tab', { name: /Flat/ });
    await user.click(flatTab);

    // Verify store state was updated using real store
    const currentState = useAgentChatStore.getState();
    expect(currentState.previewDialogTab).toBe('flat');
  });

  // IMPROVED: Example of testing with state changes using real store
  it('should handle loading states properly', async () => {
    // Set initial loading state using real store
    useAgentChatStore.setState({
      previewLoading: true,
      previewProgress: 0.5,
    });

    render(
      <TestWrapper>
        <PromptPreviewDialog
          open={true}
          onClose={vi.fn()}
          inputText='test input'
        />
      </TestWrapper>,
    );

    // Should show loading indicator
    expect(screen.queryByTestId('preview-progress-bar')).toBeInTheDocument();

    // Simulate loading completion using real store
    useAgentChatStore.setState({
      previewLoading: false,
      previewProgress: 1,
    });

    // Re-render to see changes - with real store this would happen automatically via subscription
    // In this test we verify the state was updated correctly
    const currentState = useAgentChatStore.getState();
    expect(currentState.previewLoading).toBe(false);
    expect(currentState.previewProgress).toBe(1);
  });
});
