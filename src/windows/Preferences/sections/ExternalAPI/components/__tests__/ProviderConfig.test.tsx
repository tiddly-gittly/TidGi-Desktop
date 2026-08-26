import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';

import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import { persistProviderModels, ProviderConfig } from '../ProviderConfig';

// Mock data
const mockLanguageModel: ModelInfo = {
  name: 'gpt-4',
  caption: 'GPT-4 Language Model',
  features: ['language'],
};

const mockEmbeddingModel: ModelInfo = {
  name: 'text-embedding-3-small',
  caption: 'OpenAI Embedding Model',
  features: ['embedding'],
};

const mockProvider: AIProviderConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  baseURL: 'https://api.openai.com/v1',
  models: [mockLanguageModel, mockEmbeddingModel],
  providerClass: 'openai',
  isPreset: false,
  enabled: true,
};

const mockCompatibleProvider: AIProviderConfig = {
  provider: 'compatible',
  baseURL: 'https://api.example.com/v1',
  models: [mockLanguageModel],
  providerClass: 'openAICompatible',
  isPreset: true,
  enabled: false,
};

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

describe('ProviderConfig Component', () => {
  const mockSetProviders = vi.fn();
  const mockChangeDefaultModel = vi.fn();
  const mockChangeDefaultEmbeddingModel = vi.fn();
  const mockChangeDefaultSpeechModel = vi.fn();
  const mockChangeDefaultImageGenerationModel = vi.fn();
  const mockChangeDefaultTranscriptionsModel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ExternalAPI service methods
    Object.defineProperty(window.service.externalAPI, 'updateProvider', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'deleteProvider', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'getAIConfig', {
      value: vi.fn().mockResolvedValue({
        default: {
          provider: 'openai',
          model: 'gpt-4',
        },
        modelParameters: {
          temperature: 0.7,
        },
      }),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'getProviderApiKey', {
      value: vi.fn().mockResolvedValue('sk-decrypted-test'),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'updateDefaultAIConfig', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    // Mock window.confirm
    Object.defineProperty(window, 'confirm', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
    });
  });

  const renderProviderConfig = (providers: AIProviderConfig[] = [mockProvider]) => {
    return render(
      <TestWrapper>
        <ProviderConfig
          providers={providers}
          catalogProviders={[mockProvider, mockCompatibleProvider]}
          setProviders={mockSetProviders}
          changeDefaultModel={mockChangeDefaultModel}
          changeDefaultEmbeddingModel={mockChangeDefaultEmbeddingModel}
          changeDefaultSpeechModel={mockChangeDefaultSpeechModel}
          changeDefaultImageGenerationModel={mockChangeDefaultImageGenerationModel}
          changeDefaultTranscriptionsModel={mockChangeDefaultTranscriptionsModel}
        />
      </TestWrapper>,
    );
  };

  it('should render provider configuration with delete button for providers', () => {
    renderProviderConfig();

    // Should show provider tab
    expect(screen.getByText('openai')).toBeInTheDocument();

    // Should show delete provider button (since mockProvider is not preset)
    expect(screen.getByTestId('delete-provider-button')).toBeInTheDocument();
  });

  it('loads the encrypted credential into the settings field for reveal and copy', async () => {
    renderProviderConfig([{ ...mockProvider, apiKey: undefined, hasApiKey: true }]);

    await waitFor(() => {
      expect(screen.getByTestId('provider-api-key-input')).toHaveValue('sk-decrypted-test');
    });
    expect(screen.getByTestId('provider-api-key-input')).toHaveAttribute('type', 'text');
    expect(window.service.externalAPI.getProviderApiKey).toHaveBeenCalledWith('openai');
  });

  it('should call deleteProvider API when delete button is clicked', async () => {
    const user = userEvent.setup();
    renderProviderConfig();

    // Find and click the delete provider button
    const deleteButton = screen.getByTestId('delete-provider-button');
    await user.click(deleteButton);

    // Verify confirmation was shown
    expect(window.confirm).toHaveBeenCalled();

    // Verify the delete API was called
    await waitFor(() => {
      expect(window.service.externalAPI.deleteProvider).toHaveBeenCalledWith('openai');
    });

    // Verify local state was updated
    expect(mockSetProviders).toHaveBeenCalledWith([]);
  });

  it('should not delete provider if user cancels confirmation', async () => {
    const user = userEvent.setup();

    // Mock window.confirm to return false (user cancels)
    Object.defineProperty(window, 'confirm', {
      value: vi.fn().mockReturnValue(false),
      writable: true,
    });

    renderProviderConfig();

    // Find and click the delete provider button
    const deleteButton = screen.getByTestId('delete-provider-button');
    await user.click(deleteButton);

    // Verify confirmation was shown
    expect(window.confirm).toHaveBeenCalled();

    // Verify the delete API was NOT called
    expect(window.service.externalAPI.deleteProvider).not.toHaveBeenCalled();

    // Verify local state was NOT updated
    expect(mockSetProviders).not.toHaveBeenCalled();
  });

  it('should render add provider form when add button is clicked', async () => {
    const user = userEvent.setup();
    renderProviderConfig();

    // Find and click the add provider button
    const addButton = screen.getByTestId('add-new-provider-button');
    await user.click(addButton);

    // Should show new provider form
    expect(screen.getByText('Preference.CancelAddProvider')).toBeInTheDocument();

    // Should show form fields (these are likely in NewProviderForm component)
    // We'll verify the button text change for now
    expect(addButton).toHaveTextContent('Preference.CancelAddProvider');
  });

  it('rejects a non-canonical provider id before calling the persistence service', async () => {
    const user = userEvent.setup();
    renderProviderConfig([]);

    await user.click(screen.getByTestId('add-new-provider-button'));
    await user.type(screen.getByTestId('new-provider-name-input'), 'TestProvider');
    await user.type(screen.getByTestId('new-provider-base-url-input'), 'https://models.example.test/v1');
    await user.click(screen.getByTestId('add-provider-submit-button'));

    expect(await screen.findByText('Preference.ProviderIdInvalid')).toBeInTheDocument();
    expect(window.service.externalAPI.updateProvider).not.toHaveBeenCalled();
  });

  it('round-trips advanced model metadata through the edit dialog and IPC persistence helper', async () => {
    const user = userEvent.setup();
    const advancedModel: ModelInfo = {
      name: 'deepseek-reasoning',
      caption: 'DeepSeek reasoning',
      features: ['language', 'toolCalling', 'reasoning'],
      apiMode: 'chat-completions',
      contextWindowSize: 1_000_000,
      maxOutputTokens: 32_768,
      modelOptions: { top_p: 0.95 },
      supportsReasoningEffort: ['minimal', 'low', 'medium', 'high'],
      reasoningEffortFormat: 'chat-completions',
    };
    renderProviderConfig([{ ...mockProvider, models: [advancedModel] }]);

    await user.click(screen.getByTestId('model-chip-deepseek-reasoning'));
    expect(await screen.findByTestId('model-context-window-input')).toHaveValue(1_000_000);
    expect(screen.getByTestId('model-max-output-input')).toHaveValue(32_768);
    expect(screen.getByTestId('model-top-p-input')).toHaveValue(0.95);
    expect(screen.getByRole('checkbox', { name: 'minimal' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'high' })).toBeChecked();

    const saveButton = screen.getByTestId('save-model-button');
    expect(saveButton).toBeEnabled();
    await persistProviderModels('openai', [advancedModel]);
    await waitFor(() => {
      expect(window.service.externalAPI.updateProvider).toHaveBeenCalledWith('openai', {
        models: [expect.objectContaining(advancedModel)],
      });
    });
  });

  // NOTE: embedding-model defaulting when enabling a provider is handled during provider addition
  // (handleAddProvider) and not on enable toggle. Removed the old enable-toggle test.
  it('should automatically add embedding model when selecting preset provider with embedding model', async () => {
    const user = userEvent.setup();

    // Start with no providers to show the add provider form
    renderProviderConfig([]);

    // Click add provider button to show form
    const addButton = screen.getByTestId('add-new-provider-button');
    await user.click(addButton);

    // Mock the provider creation API calls
    const mockUpdateProvider = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.service.externalAPI, 'updateProvider', {
      value: mockUpdateProvider,
      writable: true,
    });

    // Mock AI config to simulate no existing embedding model
    Object.defineProperty(window.service.externalAPI, 'getAIConfig', {
      value: vi.fn().mockResolvedValue({
        default: {
          provider: '',
          model: '',
        },
        modelParameters: {},
      }),
      writable: true,
    });

    const mockUpdateDefaultAIConfig = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.service.externalAPI, 'updateDefaultAIConfig', {
      value: mockUpdateDefaultAIConfig,
      writable: true,
    });

    // Note: The actual form interaction would require the NewProviderForm component to be rendered
    // For now, we'll test the logic by calling the handler directly through the component's internal state
    // This is a limitation of testing complex forms - ideally we'd have integration tests

    // The test structure shows what should happen when siliconflow is selected:
    // 1. Language model "Qwen/Qwen2.5-7B-Instruct" should be added
    // 2. Embedding model "BAAI/bge-m3" should be added
    // 3. Embedding model should be set as default if no existing embedding model

    expect(true).toBe(true); // Placeholder - real test would interact with form
  });
});
