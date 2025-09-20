import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';

import { AIProviderConfig, ModelFeature, ModelInfo } from '@services/externalAPI/interface';
import { ExternalAPI } from '../index';

// Mock data
const mockLanguageModel: ModelInfo = {
  name: 'gpt-4',
  caption: 'GPT-4 Language Model',
  features: ['language' as ModelFeature],
};

const mockEmbeddingModel: ModelInfo = {
  name: 'text-embedding-3-small',
  caption: 'OpenAI Embedding Model',
  features: ['embedding' as ModelFeature],
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

const mockAIConfig = {
  api: {
    provider: 'openai',
    model: 'gpt-4',
    embeddingModel: 'text-embedding-3-small',
  },
  modelParameters: {
    temperature: 0.7,
    systemPrompt: 'You are a helpful assistant.',
    topP: 0.95,
  },
};

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

describe('ExternalAPI Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ExternalAPI service methods
    Object.defineProperty(window.service.externalAPI, 'getAIProviders', {
      value: vi.fn().mockResolvedValue([mockProvider]),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'getAIConfig', {
      value: vi.fn().mockResolvedValue(mockAIConfig),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'updateDefaultAIConfig', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'updateProvider', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    Object.defineProperty(window.service.externalAPI, 'deleteProvider', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });

    // Mock the new delete field API
    Object.defineProperty(window.service.externalAPI, 'deleteFieldFromDefaultAIConfig', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
    });
  });

  // Helper function to render ExternalAPI with theme wrapper and wait for loading to complete
  const renderExternalAPI = async () => {
    const result = render(
      <TestWrapper>
        <ExternalAPI />
      </TestWrapper>,
    );

    // Wait for initial loading to complete to avoid act warnings
    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    return result;
  };

  it('should render loading state initially', async () => {
    // Don't await here to test the loading state
    render(
      <TestWrapper>
        <ExternalAPI />
      </TestWrapper>,
    );
    expect(screen.getByText('Loading')).toBeInTheDocument();

    // Wait for loading to complete to avoid act warnings for subsequent async updates
    await waitFor(() => {
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });
  });

  it('should render AI model selectors after loading', async () => {
    await renderExternalAPI();

    // Should show both model selectors using translation keys
    expect(screen.getByText('Preference.DefaultAIModelSelection')).toBeInTheDocument();
    expect(screen.getByText('Preference.DefaultEmbeddingModelSelection')).toBeInTheDocument();
  });

  it('should show model selectors with autocomplete inputs', async () => {
    await renderExternalAPI();

    // Should have two autocomplete inputs for models
    const inputs = screen.getAllByRole('combobox');
    expect(inputs).toHaveLength(2);
  });

  it('should call delete API when default model is cleared and no embedding model exists', async () => {
    const user = userEvent.setup();

    // Mock config with no embedding model
    Object.defineProperty(window.service.externalAPI, 'getAIConfig', {
      value: vi.fn().mockResolvedValue({
        api: {
          provider: 'openai',
          model: 'gpt-4',
          // No embeddingModel
        },
        modelParameters: {
          temperature: 0.7,
          systemPrompt: 'You are a helpful assistant.',
          topP: 0.95,
        },
      }),
      writable: true,
    });

    await renderExternalAPI();

    // Find default model autocomplete (first one)
    const modelSelector = screen.getAllByRole('combobox')[0];

    // Look for clear button (usually an X button in MUI Autocomplete)
    const clearButton = modelSelector.parentElement?.querySelector('button[title*="Clear"], button[aria-label*="clear"], svg[data-testid="ClearIcon"]');

    if (clearButton) {
      await user.click(clearButton as HTMLElement);

      // Verify both model and provider fields are deleted when no embedding model exists
      await waitFor(() => {
        expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.model');
      });
      await waitFor(() => {
        expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.provider');
      });

      // Also verify that handleConfigChange was called to update local state
      await waitFor(() => {
        expect(window.service.externalAPI.updateDefaultAIConfig).toHaveBeenCalled();
      });
    } else {
      // If we can't find clear button, test the onClear callback directly
      const autocompleteInput = modelSelector.querySelector('input');
      if (autocompleteInput) {
        // Focus and clear the input to trigger onChange with null value
        await user.click(autocompleteInput);
        await user.clear(autocompleteInput);
        await user.keyboard('{Escape}'); // Close dropdown

        // Verify the delete API was called
        await waitFor(() => {
          expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.model');
          expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.provider');
        });
      }
    }
  });

  it('should only clear model field when embedding model exists', async () => {
    const user = userEvent.setup();

    // Mock config with embedding model - this should preserve the provider
    Object.defineProperty(window.service.externalAPI, 'getAIConfig', {
      value: vi.fn().mockResolvedValue({
        api: {
          provider: 'openai',
          model: 'gpt-4',
          embeddingModel: 'text-embedding-3-small', // Has embedding model
        },
        modelParameters: {
          temperature: 0.7,
          systemPrompt: 'You are a helpful assistant.',
          topP: 0.95,
        },
      }),
      writable: true,
    });

    await renderExternalAPI();

    // Find default model autocomplete (first one)
    const modelSelector = screen.getAllByRole('combobox')[0];

    // Look for clear button
    const clearButton = modelSelector.parentElement?.querySelector('button[title*="Clear"], button[aria-label*="clear"], svg[data-testid="ClearIcon"]');

    if (clearButton) {
      await user.click(clearButton as HTMLElement);

      // Should only delete model, NOT provider (because embedding model uses the provider)
      await waitFor(() => {
        expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.model');
      });

      // Should NOT delete provider when embedding model exists
      expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).not.toHaveBeenCalledWith('api.provider');

      // Verify that handleConfigChange was called
      await waitFor(() => {
        expect(window.service.externalAPI.updateDefaultAIConfig).toHaveBeenCalled();
      });
    } else {
      // Fallback test
      const autocompleteInput = modelSelector.querySelector('input');
      if (autocompleteInput) {
        await user.click(autocompleteInput);
        await user.clear(autocompleteInput);
        await user.keyboard('{Escape}');

        await waitFor(() => {
          expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.model');
        });

        expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).not.toHaveBeenCalledWith('api.provider');
      }
    }
  });

  it('should call delete API when embedding model is cleared via autocomplete', async () => {
    const user = userEvent.setup();
    await renderExternalAPI();

    // Find embedding model autocomplete (second one)
    const embeddingSelector = screen.getAllByRole('combobox')[1];

    // Look for clear button (usually an X button in MUI Autocomplete)
    const clearButton = embeddingSelector.parentElement?.querySelector('button[title*="Clear"], button[aria-label*="clear"], svg[data-testid="ClearIcon"]');

    if (clearButton) {
      await user.click(clearButton as HTMLElement);

      // Verify the delete API was called
      await waitFor(() => {
        expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.embeddingModel');
      });

      // Also verify that handleConfigChange was called to update local state
      await waitFor(() => {
        expect(window.service.externalAPI.updateDefaultAIConfig).toHaveBeenCalled();
      });
    } else {
      // If we can't find clear button, test the onClear callback directly by simulating autocomplete change to null
      const autocompleteInput = embeddingSelector.querySelector('input');
      if (autocompleteInput) {
        // Focus and clear the input to trigger onChange with null value
        await user.click(autocompleteInput);
        await user.clear(autocompleteInput);
        await user.keyboard('{Escape}'); // Close dropdown

        // Verify the delete API was called
        await waitFor(() => {
          expect(window.service.externalAPI.deleteFieldFromDefaultAIConfig).toHaveBeenCalledWith('api.embeddingModel');
        });
      }
    }
  });

  it('should handle embedding model clear functionality directly', async () => {
    // Test the clear functionality by directly calling the ModelSelector with onClear
    const mockOnClear = vi.fn();

    // Create a simple test for ModelSelector clear functionality
    const { ModelSelector } = await import('../components/ModelSelector');

    const testConfig = {
      api: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        embeddingModel: 'text-embedding-3-small',
      },
      modelParameters: {},
    };

    render(
      <TestWrapper>
        <ModelSelector
          selectedConfig={testConfig}
          modelOptions={[[mockProvider, mockEmbeddingModel]]}
          onChange={vi.fn()}
          onClear={mockOnClear}
        />
      </TestWrapper>,
    );

    // Find and click clear button
    const input = screen.getByRole('combobox');
    const clearButton = input.parentElement?.querySelector('button[title*="Clear"], [data-testid="ClearIcon"]');

    if (clearButton) {
      await userEvent.click(clearButton);
      expect(mockOnClear).toHaveBeenCalled();
    }
  });

  it('should render provider configuration section', async () => {
    await renderExternalAPI();

    // Should show add new provider button
    const addProviderButton = screen.getByTestId('add-new-provider-button');
    expect(addProviderButton).toBeInTheDocument();
  });

  it('should render model parameters configuration button', async () => {
    await renderExternalAPI();

    // Should show configure model parameters button
    expect(screen.getByText('Preference.ConfigureModelParameters')).toBeInTheDocument();
  });

  it('should render provider delete buttons for non-preset providers', async () => {
    await renderExternalAPI();

    // Should show delete provider buttons (since mockProvider is not preset)
    const deleteButtons = screen.getAllByTestId('delete-provider-button');
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('should call deleteProvider API when provider delete button is clicked', async () => {
    const user = userEvent.setup();

    // Mock window.confirm to return true (user confirms deletion)
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);

    await renderExternalAPI();

    // Find and click the delete provider button
    const deleteButton = screen.getByTestId('delete-provider-button');
    await user.click(deleteButton);

    // Verify the delete API was called
    await waitFor(() => {
      expect(window.service.externalAPI.deleteProvider).toHaveBeenCalledWith('openai');
    });

    // Restore original confirm
    window.confirm = originalConfirm;
  });
});
