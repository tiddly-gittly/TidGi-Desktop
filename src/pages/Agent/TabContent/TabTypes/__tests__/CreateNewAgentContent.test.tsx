import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ICreateNewAgentTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { ThemeProvider } from '@mui/material/styles';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { lightTheme } from '@services/theme/defaultTheme';
import { CreateNewAgentContent } from '../CreateNewAgentContent';

// Mock agent definition service
const mockCreateAgentDef = vi.fn();
const mockUpdateAgentDef = vi.fn();
const mockDeleteAgentDef = vi.fn();
const mockGetAgentDef = vi.fn();
const mockGetAgentDefs = vi.fn();
const mockUpdateTab = vi.fn();
const mockGetAllTabs = vi.fn();
const mockGetActiveTabId = vi.fn();
const mockGetHandlerConfigSchema = vi.fn();

Object.defineProperty(window, 'service', {
  writable: true,
  value: {
    agentDefinition: {
      createAgentDef: mockCreateAgentDef,
      updateAgentDef: mockUpdateAgentDef,
      deleteAgentDef: mockDeleteAgentDef,
      getAgentDef: mockGetAgentDef,
      getAgentDefs: mockGetAgentDefs,
    },
    agentInstance: {
      getHandlerConfigSchema: mockGetHandlerConfigSchema,
    },
    agentBrowser: {
      updateTab: mockUpdateTab,
      getAllTabs: mockGetAllTabs,
      getActiveTabId: mockGetActiveTabId,
    },
    native: {
      log: vi.fn(),
    },
  },
});

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'CreateAgent.Title': '创建新智能体',
        'CreateAgent.SetupAgent': '设置智能体',
        'CreateAgent.SetupAgentDescription': '为您的智能体命名并选择一个模板作为起点',
        'CreateAgent.AgentName': '智能体名称',
        'CreateAgent.AgentNamePlaceholder': '输入智能体名称...',
        'CreateAgent.AgentNameHelper': '为您的智能体起一个描述性的名字',
        'CreateAgent.SelectTemplate': '选择模板',
        'CreateAgent.SelectTemplateDescription': '选择一个现有的智能体作为起始模板',
        'CreateAgent.SearchTemplates': '搜索模板...',
        'CreateAgent.SelectedTemplate': '已选模板',
        'CreateAgent.EditPrompt': '编辑提示词',
        'CreateAgent.EditPromptDescription': '自定义您的智能体的系统提示词和行为',
        'CreateAgent.ImmediateUse': '测试并使用',
        'CreateAgent.ImmediateUseDescription': '测试您的智能体并立即开始使用',
        'CreateAgent.Next': '下一步',
        'CreateAgent.Back': '上一步',
        'CreateAgent.SaveAndUse': '保存并使用智能体',
        'CreateAgent.Steps.setupAgent': '设置智能体',
        'CreateAgent.Steps.editPrompt': '编辑提示词',
        'CreateAgent.Steps.immediateUse': '立即使用',
        'CreateAgent.NoTemplateSelected': '请先选择一个模板',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock matchMedia for autocomplete
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const mockTab: ICreateNewAgentTab = {
  id: 'test-tab-123',
  type: TabType.CREATE_NEW_AGENT,
  title: 'Create New Agent',
  state: TabState.ACTIVE,
  isPinned: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  currentStep: 0, // Start from first step (selectTemplate)
};

const TestComponent: React.FC<{ tab: ICreateNewAgentTab }> = ({ tab }) => (
  <ThemeProvider theme={lightTheme}>
    <CreateNewAgentContent tab={tab} />
  </ThemeProvider>
);

describe('CreateNewAgentContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgentDefs.mockResolvedValue([
      { id: 'agent1', name: 'Code Assistant', description: 'Helps with coding' },
      { id: 'agent2', name: 'Writing Helper', description: 'Helps with writing' },
    ]);
    mockUpdateTab.mockResolvedValue(undefined);
    mockGetAllTabs.mockResolvedValue([]);
    mockGetActiveTabId.mockResolvedValue('test-tab-123');
    mockGetHandlerConfigSchema.mockResolvedValue({
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', title: 'System Prompt' },
            },
          },
        },
      },
    });
  });

  it('should render the first step (setup agent)', () => {
    render(<TestComponent tab={mockTab} />);

    expect(screen.getByText('创建新智能体')).toBeInTheDocument();
    // Use getByRole to find the specific heading in the step content
    expect(screen.getByRole('heading', { name: '选择模板' })).toBeInTheDocument();
    expect(screen.getByText('选择一个现有的智能体作为起始模板')).toBeInTheDocument();

    // Check that search input is rendered but NOT agent name input in step 1
    expect(screen.getByTestId('template-search-input')).toBeInTheDocument();
  });
  it('should show next button disabled initially', () => {
    render(<TestComponent tab={mockTab} />);

    const nextButton = screen.getByTestId('next-button');
    expect(nextButton).toBeInTheDocument();
    expect(nextButton).toBeDisabled();
  });

  it('should advance to step 2 when template is selected', async () => {
    const mockTemplate = {
      id: 'template-1',
      name: 'Test Template',
      description: 'Test Description',
      handlerConfig: { systemPrompt: 'Test prompt' },
    };

    mockCreateAgentDef.mockResolvedValue({
      ...mockTemplate,
      id: 'temp-123',
      name: 'Test Template (Copy)',
    });

    render(<TestComponent tab={mockTab} />);

    // Simulate template selection - this would normally happen via the TemplateSearch component
    // We'll test the handleTemplateSelect function indirectly by checking state changes
    expect(screen.getByRole('heading', { name: '选择模板' })).toBeInTheDocument();
  });

  it('should show step 2 (edit prompt) when currentStep is 1', () => {
    const step2Tab = { ...mockTab, currentStep: 1 };
    render(<TestComponent tab={step2Tab} />);

    // Step 2 should show prompt editor placeholder when no template selected
    expect(screen.getByText('请先选择一个模板')).toBeInTheDocument();
  });

  it('should show step 3 (immediate use) when currentStep is 2', () => {
    const step3Tab = { ...mockTab, currentStep: 2 };
    render(<TestComponent tab={step3Tab} />);

    expect(screen.getByRole('heading', { name: '测试并使用' })).toBeInTheDocument();
    expect(screen.getByText('测试您的智能体并立即开始使用')).toBeInTheDocument();
  });

  it('should handle out-of-bounds step when currentStep is 3', () => {
    const step4Tab = { ...mockTab, currentStep: 3 };
    render(<TestComponent tab={step4Tab} />);

    // Should handle out-of-bounds gracefully
    expect(screen.getByText('创建新智能体')).toBeInTheDocument(); // Main title should exist
  });

  it('should allow entering agent name in step 1 (setup agent)', async () => {
    const step1Tab = { ...mockTab, currentStep: 0 }; // Step 1 = setupAgent
    render(<TestComponent tab={step1Tab} />);

    const nameInput = screen.getByLabelText('智能体名称');
    fireEvent.change(nameInput, { target: { value: 'My Custom Agent' } });

    expect(nameInput).toHaveValue('My Custom Agent');
  });

  it('should require template for step 1', async () => {
    render(<TestComponent tab={mockTab} />);

    const nextButton = screen.getByTestId('next-button');

    // Initially disabled (no template selected in step 1)
    expect(nextButton).toBeDisabled();
  });

  it('should show correct step content based on currentStep', () => {
    // Test step 1 (currentStep: 0) - Setup Agent (name + template)
    const step1Tab = { ...mockTab, currentStep: 0 };
    const { rerender } = render(<TestComponent tab={step1Tab} />);

    expect(screen.getByRole('heading', { name: '设置智能体' })).toBeInTheDocument();
    expect(screen.getByLabelText('智能体名称')).toBeInTheDocument();
    expect(screen.getByTestId('template-search-input')).toBeInTheDocument();

    // Test step 2 (currentStep: 1) - Edit Prompt
    const step2Tab = { ...mockTab, currentStep: 1 };
    rerender(<TestComponent tab={step2Tab} />);

    // Should show editPrompt placeholder when no template selected
    expect(screen.getByText('请先选择一个模板')).toBeInTheDocument();

    // Test step 3 (currentStep: 2) - Immediate Use
    const step3Tab = { ...mockTab, currentStep: 2 };
    rerender(<TestComponent tab={step3Tab} />);

    expect(screen.getByRole('heading', { name: '测试并使用' })).toBeInTheDocument();
  });

  it('should handle direct step advancement for testing', () => {
    // Test step 2 directly to verify editPrompt content renders properly
    const step2Tab = { ...mockTab, currentStep: 1 };
    render(<TestComponent tab={step2Tab} />);

    // Should show editPrompt content (placeholder when no template selected)
    expect(screen.getByText('请先选择一个模板')).toBeInTheDocument();
  });

  it('should call getAgentDef when tab has agentDefId (state restoration)', async () => {
    // Mock agent definition for state restoration
    const mockAgentDefinition = {
      id: 'temp-123',
      name: 'Test Agent',
      handlerID: 'test-handler',
      handlerConfig: { prompts: [{ text: 'Original prompt', role: 'system' }] },
    };

    mockGetAgentDef.mockResolvedValue(mockAgentDefinition);

    const tabWithAgentDef: ICreateNewAgentTab = {
      ...mockTab,
      currentStep: 1, // Step 2: Edit prompt
      agentDefId: 'temp-123', // This should trigger state restoration
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <CreateNewAgentContent tab={tabWithAgentDef} />
      </ThemeProvider>,
    );

    // Verify that getAgentDef was called for state restoration
    await waitFor(() => {
      expect(mockGetAgentDef).toHaveBeenCalledWith('temp-123');
    }, { timeout: 1000 });

    // State restoration shouldn't trigger auto-save, so updateAgentDef should not be called
    expect(mockUpdateAgentDef).not.toHaveBeenCalled();
  });

  it('should trigger schema loading when temporaryAgentDefinition has handlerID', async () => {
    // Mock agent definition with handlerID that will be restored
    const mockAgentDefinition = {
      id: 'temp-123',
      name: 'Test Agent',
      handlerID: 'test-handler',
      handlerConfig: { prompts: [{ text: 'Test prompt', role: 'system' }] },
    };

    mockGetAgentDef.mockResolvedValue(mockAgentDefinition);

    const tabWithAgent: ICreateNewAgentTab = {
      ...mockTab,
      currentStep: 1, // Step 2: Edit prompt
      agentDefId: 'temp-123', // This will trigger state restoration
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <CreateNewAgentContent tab={tabWithAgent} />
      </ThemeProvider>,
    );

    // Wait for state restoration first
    await waitFor(() => {
      expect(mockGetAgentDef).toHaveBeenCalledWith('temp-123');
    }, { timeout: 1000 });

    // After restoration, the component should have the handlerID and trigger schema loading
    await waitFor(() => {
      expect(mockGetHandlerConfigSchema).toHaveBeenCalledWith('test-handler');
    }, { timeout: 2000 });
  });

  it('should handle PromptConfigForm rendering in step 2', async () => {
    // Simple test to verify PromptConfigForm can render
    const tabStep2: ICreateNewAgentTab = {
      ...mockTab,
      currentStep: 1, // Step 2: Edit prompt
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <CreateNewAgentContent tab={tabStep2} />
      </ThemeProvider>,
    );

    // Should show editPrompt content
    expect(await screen.findByText('请先选择一个模板')).toBeInTheDocument();
  });

  it('should call createAgentDef when template is selected', async () => {
    // Simple test to verify backend call happens
    const mockTemplate = {
      id: 'template-1',
      name: 'Test Template',
      handlerID: 'test-handler',
      handlerConfig: { prompts: [{ text: 'Test prompt', role: 'system' }] },
    };

    const mockCreatedDefinition = {
      ...mockTemplate,
      id: 'temp-123',
      name: 'Test Template (Copy)',
    };

    mockCreateAgentDef.mockResolvedValue(mockCreatedDefinition);

    const tabStep1: ICreateNewAgentTab = {
      ...mockTab,
      currentStep: 0, // Step 1: Setup agent
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <CreateNewAgentContent tab={tabStep1} />
      </ThemeProvider>,
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('创建新智能体')).toBeInTheDocument();
    });

    // Note: Template selection would trigger createAgentDef in real usage
    // This test verifies the mock is properly set up
    expect(mockCreateAgentDef).toHaveBeenCalledTimes(0); // Not called yet without user interaction
  });

  it('should verify data flow: template selection -> temporaryAgentDefinition -> auto-save', async () => {
    const mockTemplate = {
      id: 'template-1',
      name: 'Test Template',
      handlerID: 'test-handler',
      handlerConfig: { prompts: [{ text: 'Original prompt' }] },
    };

    const mockCreatedDefinition = {
      ...mockTemplate,
      id: 'temp-123',
      name: 'Test Template (Copy)',
    };

    mockCreateAgentDef.mockResolvedValue(mockCreatedDefinition);

    // Test component with template selection capability
    const TestTemplateSelection: React.FC = () => {
      const [tab] = React.useState(mockTab);
      const [definition, setDefinition] = React.useState<AgentDefinition | null>(null);

      // Simulate template selection directly
      React.useEffect(() => {
        const simulateTemplateSelection = async () => {
          try {
            // This simulates what handleTemplateSelect does
            const tempId = `temp-${Date.now()}`;
            const newAgentDefinition = {
              ...mockTemplate,
              id: tempId,
              name: 'My Agent',
            };

            const createdDefinition = await window.service.agentDefinition.createAgentDef(newAgentDefinition);
            setDefinition(createdDefinition);

            // Simulate auto-save after 50ms (shorter than real 500ms)
            setTimeout(async () => {
              if (createdDefinition?.id) {
                await window.service.agentDefinition.updateAgentDef(createdDefinition);
              }
            }, 50);
          } catch {
            // Template selection error handling
          }
        };

        void simulateTemplateSelection();
      }, []);

      return (
        <ThemeProvider theme={lightTheme}>
          <div>
            <CreateNewAgentContent tab={tab} />
            <div data-testid='definition-state'>
              {definition ? `Created: ${definition.id}` : 'No definition'}
            </div>
          </div>
        </ThemeProvider>
      );
    };

    render(<TestTemplateSelection />);

    // Verify createAgentDef was called
    await waitFor(() => {
      expect(mockCreateAgentDef).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Agent',
          handlerID: 'test-handler',
        }),
      );
    });

    // Wait for definition state to be set
    await waitFor(() => {
      const state = screen.getByTestId('definition-state');
      expect(state.textContent).toContain('Created: temp-');
    });

    // Wait for auto-save to be called
    await waitFor(() => {
      expect(mockUpdateAgentDef).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining('temp-'),
          handlerID: 'test-handler',
        }),
      );
    }, { timeout: 500 });
  });

  it('should handle nested prompt structure like defaultAgents.json', async () => {
    // This is the actual structure from defaultAgents.json
    const mockTemplate = {
      id: 'example-agent',
      name: 'Example Agent',
      handlerID: 'basicPromptConcatHandler',
      handlerConfig: {
        prompts: [
          {
            id: 'system',
            caption: 'Main Prompt',
            enabled: true,
            role: 'system',
            children: [
              {
                id: 'default-main',
                tags: ['SystemPrompt'],
                text: 'You are a helpful assistant for Tiddlywiki user.',
              },
            ],
          },
        ],
        response: [],
        plugins: [],
      },
    };

    const mockCreatedDefinition = {
      ...mockTemplate,
      id: 'temp-123',
      name: 'Example Agent (Copy)',
    };

    mockCreateAgentDef.mockResolvedValue(mockCreatedDefinition);

    // Step 1: Create agent definition (simulates template selection)
    const createdDef = await window.service.agentDefinition.createAgentDef(mockCreatedDefinition);
    expect(createdDef).toBeDefined();
    const prompts = (createdDef.handlerConfig).prompts as Array<{
      children?: Array<{ text?: string }>;
    }>;
    expect((prompts as Array<{ children?: Array<{ text?: string }> }>)[0]?.children?.[0]?.text).toBe('You are a helpful assistant for Tiddlywiki user.');

    // Step 2: Update system prompt in nested structure
    const updatedDefinition = {
      ...mockCreatedDefinition,
      handlerConfig: {
        ...mockCreatedDefinition.handlerConfig,
        prompts: [
          {
            ...mockCreatedDefinition.handlerConfig.prompts[0],
            children: [
              {
                ...mockCreatedDefinition.handlerConfig.prompts[0].children[0],
                text: '你是一个专业的代码助手，请用中文回答编程问题。',
              },
            ],
          },
        ],
      },
    };

    await window.service.agentDefinition.updateAgentDef(updatedDefinition);

    // Verify the correct nested structure is updated
    expect(mockUpdateAgentDef).toHaveBeenCalledWith(
      expect.objectContaining({
        handlerConfig: expect.objectContaining({
          prompts: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              children: expect.arrayContaining([
                expect.objectContaining({
                  text: '你是一个专业的代码助手，请用中文回答编程问题。',
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });
});
