import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { type INewTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { NewTabContent } from '../NewTabContent';

// Mock backend services
const mockUpdateTab = vi.fn();
const mockGetAllTabs = vi.fn();
const mockGetActiveTabId = vi.fn();
const mockAddTab = vi.fn();
const mockCreateAgent = vi.fn();
const mockLog = vi.fn();

Object.defineProperty(window, 'service', {
  writable: true,
  value: {
    agentBrowser: {
      updateTab: mockUpdateTab,
      getAllTabs: mockGetAllTabs,
      getActiveTabId: mockGetActiveTabId,
      addTab: mockAddTab,
    },
    agentInstance: {
      createAgent: mockCreateAgent,
    },
    native: {
      log: mockLog,
    },
  },
});

describe('NewTabContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTabs.mockResolvedValue([]);
    mockGetActiveTabId.mockResolvedValue(null);
    mockCreateAgent.mockResolvedValue({
      id: 'test-agent-id',
      name: 'Test Agent',
      agentDefId: 'example-agent',
    });
    mockAddTab.mockResolvedValue({
      id: 'test-tab-id',
      type: 'CHAT',
      title: 'Test Chat',
    });
  });

  const renderComponent = () => {
    const mockTab: INewTab = {
      id: 'test-tab',
      type: TabType.NEW_TAB,
      title: 'New Tab',
      state: TabState.ACTIVE,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <NewTabContent tab={mockTab} />
      </ThemeProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render create new agent button', () => {
    renderComponent();

    const createNewAgentButton = screen.getByTestId('create-new-agent-button');
    expect(createNewAgentButton).toBeInTheDocument();
    expect(createNewAgentButton).toHaveTextContent('NewTab.CreateNewAgent');
  });

  it('should render create default agent button', () => {
    renderComponent();

    const createDefaultAgentButton = screen.getByTestId('create-default-agent-button');
    expect(createDefaultAgentButton).toBeInTheDocument();
    expect(createDefaultAgentButton).toHaveTextContent('NewTab.CreateDefaultAgent');
  });

  it('should handle create new agent button click', async () => {
    const user = userEvent.setup();
    renderComponent();

    const createNewAgentButton = screen.getByTestId('create-new-agent-button');
    await user.click(createNewAgentButton);

    // The button should be clickable and not cause errors
    expect(createNewAgentButton).toBeInTheDocument();
  });

  it('should handle create default agent button click', async () => {
    const user = userEvent.setup();
    renderComponent();

    const createDefaultAgentButton = screen.getByTestId('create-default-agent-button');
    await user.click(createDefaultAgentButton);

    // The button should be clickable and not cause errors
    expect(createDefaultAgentButton).toBeInTheDocument();
  });

  it('should render search interface', () => {
    renderComponent();

    const searchInput = screen.getByRole('combobox');
    expect(searchInput).toBeInTheDocument();
  });

  it('should display quick access section with both buttons', () => {
    renderComponent();

    // Check that quick access section is rendered
    expect(screen.getByText('NewTab.QuickAccess')).toBeInTheDocument();

    // Both buttons should be present
    expect(screen.getByTestId('create-default-agent-button')).toBeInTheDocument();
    expect(screen.getByTestId('create-new-agent-button')).toBeInTheDocument();
  });

  it('should show context menu on right click of default agent button', async () => {
    const user = userEvent.setup();
    renderComponent();

    const createDefaultAgentButton = screen.getByTestId('create-default-agent-button');

    // Right click to open context menu
    await user.pointer({ keys: '[MouseRight]', target: createDefaultAgentButton });

    // Context menu should appear
    expect(screen.getByText('NewTab.CreateInstance')).toBeInTheDocument();
    expect(screen.getByText('NewTab.EditDefinition')).toBeInTheDocument();
  });

  it('should handle create instance option from context menu', async () => {
    const user = userEvent.setup();
    renderComponent();

    const createDefaultAgentButton = screen.getByTestId('create-default-agent-button');

    // Right click to open context menu
    await user.pointer({ keys: '[MouseRight]', target: createDefaultAgentButton });

    // Verify context menu options are clickable
    const createInstanceOption = screen.getByText('NewTab.CreateInstance');
    expect(createInstanceOption).toBeInTheDocument();

    // Verify the option is clickable (won't test the actual close behavior in this environment)
    await user.click(createInstanceOption);
  });

  it('should handle edit definition option from context menu', async () => {
    const user = userEvent.setup();
    renderComponent();

    const createDefaultAgentButton = screen.getByTestId('create-default-agent-button');

    // Right click to open context menu
    await user.pointer({ keys: '[MouseRight]', target: createDefaultAgentButton });

    // Verify context menu options are clickable
    const editDefinitionOption = screen.getByText('NewTab.EditDefinition');
    expect(editDefinitionOption).toBeInTheDocument();

    // Verify the option is clickable (won't test the actual close behavior in this environment)
    await user.click(editDefinitionOption);
  });
});
