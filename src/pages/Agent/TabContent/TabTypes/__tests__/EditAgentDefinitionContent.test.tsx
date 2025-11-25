import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { type IEditAgentDefinitionTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { EditAgentDefinitionContent } from '../EditAgentDefinitionContent';

// Mock backend services
const mockUpdateTab = vi.fn();
const mockGetAllTabs = vi.fn();
const mockGetActiveTabId = vi.fn();
const mockAddTab = vi.fn();
const mockCloseTab = vi.fn();
const mockCreateAgent = vi.fn();
const mockDeleteAgent = vi.fn();
const mockGetAgentDef = vi.fn();
const mockUpdateAgentDef = vi.fn();
const mockGetFrameworkConfigSchema = vi.fn();
const mockLog = vi.fn();

Object.defineProperty(window, 'service', {
  writable: true,
  value: {
    agentBrowser: {
      updateTab: mockUpdateTab,
      getAllTabs: mockGetAllTabs,
      getActiveTabId: mockGetActiveTabId,
      addTab: mockAddTab,
      closeTab: mockCloseTab,
    },
    agentInstance: {
      createAgent: mockCreateAgent,
      deleteAgent: mockDeleteAgent,
      getFrameworkConfigSchema: mockGetFrameworkConfigSchema,
    },
    agentDefinition: {
      getAgentDef: mockGetAgentDef,
      updateAgentDef: mockUpdateAgentDef,
    },
    native: {
      log: mockLog,
    },
  },
});

const mockAgentDefinition = {
  id: 'test-agent-def-id',
  name: 'Test Agent',
  description: 'A test agent for editing',
  handlerID: 'testHandler',
  config: {},
};

const mockSchema = {
  type: 'object',
  properties: {
    systemPrompt: {
      type: 'string',
      title: 'System Prompt',
    },
  },
};

describe('EditAgentDefinitionContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTabs.mockResolvedValue([]);
    mockGetActiveTabId.mockResolvedValue(null);
    mockGetAgentDef.mockResolvedValue(mockAgentDefinition);
    mockGetFrameworkConfigSchema.mockResolvedValue(mockSchema);
    mockCreateAgent.mockResolvedValue({
      id: 'test-agent-id',
      name: 'Test Agent',
      agentDefId: 'test-agent-def-id',
    });
    mockAddTab.mockResolvedValue({
      id: 'test-tab-id',
      type: 'CHAT',
      title: 'Test Chat',
    });
    mockUpdateAgentDef.mockResolvedValue(mockAgentDefinition);
  });

  const renderComponent = async () => {
    const mockTab: IEditAgentDefinitionTab = {
      id: 'test-edit-tab',
      type: TabType.EDIT_AGENT_DEFINITION,
      title: 'Edit Agent',
      state: TabState.ACTIVE,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agentDefId: 'test-agent-def-id',
      currentStep: 0,
    };

    const result = render(
      <ThemeProvider theme={lightTheme}>
        <EditAgentDefinitionContent tab={mockTab} />
      </ThemeProvider>,
    );

    // Wait for the agent definition to load
    await waitFor(() => {
      expect(mockGetAgentDef).toHaveBeenCalledWith('test-agent-def-id');
    });

    return result;
  };

  it('should render edit agent title', async () => {
    await renderComponent();

    expect(screen.getByText('EditAgent.Title')).toBeInTheDocument();
  });

  it('should render all main sections', async () => {
    await renderComponent();

    // Check that all main sections are rendered
    expect(screen.getByText('EditAgent.EditBasic')).toBeInTheDocument();
    expect(screen.getByText('EditAgent.EditPrompt')).toBeInTheDocument();
    expect(screen.getByText('EditAgent.ImmediateUse')).toBeInTheDocument();
  });

  it('should load agent definition on mount', async () => {
    await renderComponent();

    expect(mockGetAgentDef).toHaveBeenCalledWith('test-agent-def-id');
  });

  it('should render basic info editing section', async () => {
    await renderComponent();

    expect(screen.getByText('EditAgent.EditBasic')).toBeInTheDocument();
    expect(screen.getByText('EditAgent.EditBasicDescription')).toBeInTheDocument();
    expect(screen.getByTestId('edit-agent-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('edit-agent-description-input')).toBeInTheDocument();
  });

  it('should populate agent name input with loaded data', async () => {
    await renderComponent();

    await waitFor(() => {
      const nameInput = screen.getByTestId('edit-agent-name-input-field');
      expect(nameInput).toHaveValue('Test Agent');
    });
  });

  it('should handle agent name changes', async () => {
    const user = userEvent.setup();
    await renderComponent();

    await waitFor(() => {
      const nameInput = screen.getByTestId('edit-agent-name-input-field');
      expect(nameInput).toHaveValue('Test Agent');
    });

    const nameInput = screen.getByTestId('edit-agent-name-input-field');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Agent Name');

    expect(nameInput).toHaveValue('Updated Agent Name');
  });

  it('should show current agent information in form fields', async () => {
    await renderComponent();

    await waitFor(() => {
      const nameInput = screen.getByTestId('edit-agent-name-input-field');
      expect(nameInput).toHaveValue('Test Agent');
    });

    // Check if description is also populated
    await waitFor(() => {
      const descriptionInput = screen.getByTestId('edit-agent-description-input').querySelector('textarea');
      expect(descriptionInput).toHaveValue('A test agent for editing');
    });
  });

  it('should handle save button click', async () => {
    const user = userEvent.setup();
    await renderComponent();

    // Wait for component to be fully loaded
    await waitFor(() => {
      const nameInput = screen.getByTestId('edit-agent-name-input-field');
      expect(nameInput).toHaveValue('Test Agent');
    });

    // Wait for save button to be enabled
    await waitFor(() => {
      const saveButton = screen.getByTestId('edit-agent-save-button');
      expect(saveButton).toBeEnabled();
    });

    const saveButton = screen.getByTestId('edit-agent-save-button');
    await user.click(saveButton);

    // Should save agent definition
    await waitFor(() => {
      expect(mockUpdateAgentDef).toHaveBeenCalled();
    });
  });

  it('should disable save button when agent name is empty', async () => {
    const user = userEvent.setup();
    await renderComponent();

    await waitFor(() => {
      const nameInput = screen.getByTestId('edit-agent-name-input-field');
      expect(nameInput).toHaveValue('Test Agent');
    });

    const nameInput = screen.getByTestId('edit-agent-name-input-field');
    await user.clear(nameInput);

    const saveButton = screen.getByTestId('edit-agent-save-button');
    expect(saveButton).toBeDisabled();
  });

  it('should render prompt editing section', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText('EditAgent.EditPrompt')).toBeInTheDocument();
      expect(screen.getByText('EditAgent.EditPromptDescription')).toBeInTheDocument();
    });
  });

  it('should show prompt config form when schema is loaded', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(mockGetFrameworkConfigSchema).toHaveBeenCalledWith('testHandler');
    });

    await waitFor(() => {
      expect(screen.getByTestId('edit-agent-prompt-form')).toBeInTheDocument();
    });
  });

  it('should render immediate use section', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText('EditAgent.ImmediateUse')).toBeInTheDocument();
      expect(screen.getByText('EditAgent.ImmediateUseDescription')).toBeInTheDocument();
    });
  });

  it('should show save button', async () => {
    await renderComponent();

    const saveButton = screen.getByTestId('edit-agent-save-button');
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toHaveTextContent('EditAgent.Save');
  });

  it('should auto-save agent definition changes', async () => {
    await renderComponent();

    // Wait for initial load and auto-save
    await waitFor(() => {
      expect(mockGetAgentDef).toHaveBeenCalledWith('test-agent-def-id');
    });

    // Wait for auto-save debounced call
    await waitFor(() => {
      expect(mockUpdateAgentDef).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('should load handler config schema when agent definition is available', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(mockGetFrameworkConfigSchema).toHaveBeenCalledWith('testHandler');
    });
  });

  it('should create preview agent for testing', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(mockCreateAgent).toHaveBeenCalledWith('test-agent-def-id', { preview: true });
    });
  });

  it('should handle save action', async () => {
    const user = userEvent.setup();
    await renderComponent();

    // Wait for component to be fully loaded and save button to be enabled
    await waitFor(() => {
      const nameInput = screen.getByTestId('edit-agent-name-input-field');
      expect(nameInput).toHaveValue('Test Agent');
    });

    await waitFor(() => {
      const saveButton = screen.getByTestId('edit-agent-save-button');
      expect(saveButton).toBeEnabled();
    });

    const saveButton = screen.getByTestId('edit-agent-save-button');
    await user.click(saveButton);

    // Should save agent definition
    await waitFor(() => {
      expect(mockUpdateAgentDef).toHaveBeenCalled();
    });
  });

  it('should handle missing agent definition gracefully', async () => {
    // Mock console.error to suppress expected error output
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockGetAgentDef.mockRejectedValueOnce(new Error('Agent not found'));

    await renderComponent();

    await waitFor(() => {
      expect(mockGetAgentDef).toHaveBeenCalledWith('test-agent-def-id');
    });

    // Should show error message instead of title
    await waitFor(() => {
      expect(screen.getByText('EditAgent.AgentNotFound')).toBeInTheDocument();
    });

    // Verify that the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load agent definition:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});
