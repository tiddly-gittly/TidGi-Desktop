import defaultProvidersConfig from '@services/externalAPI/defaultProviders.json';
import { AIProviderConfig, ModelFeature, ModelInfo } from '@services/externalAPI/interface';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NewModelFormState, ProviderFormState } from '../types';

// 默认新模型状态
export const DEFAULT_NEW_MODEL: NewModelFormState = {
  name: '',
  caption: '',
  features: ['language'],
};

export function useProviderForms(
  providers: AIProviderConfig[],
  showMessage: (message: string, severity: 'success' | 'error' | 'info') => void,
) {
  const { t } = useTranslation('agent');
  const [providerForms, setProviderForms] = useState<Record<string, ProviderFormState>>({});

  // Initialize form state
  useEffect(() => {
    const initialForms: Record<string, ProviderFormState> = {};

    providers.forEach(provider => {
      initialForms[provider.provider] = {
        apiKey: provider.apiKey || '',
        baseURL: provider.baseURL || '',
        models: [...provider.models],
        newModel: { ...DEFAULT_NEW_MODEL },
        enabled: provider.enabled !== false,
      };
    });

    setProviderForms(initialForms);
  }, [providers]);

  // Debounced provider update function
  const debouncedUpdateProvider = useDebouncedCallback(
    async (provider: string, config: Partial<AIProviderConfig>) => {
      try {
        await window.service.externalAPI.updateProvider(provider, config);
        showMessage(t('Preference.ProviderConfigUpdated'), 'success');
      } catch (error) {
        console.error('Failed to update provider config:', error);
        showMessage(t('Preference.FailedToUpdateProviderConfig'), 'error');
      }
    },
    [],
    1000,
  );

  // Handle form field changes
  const handleFormChange = async (
    provider: string,
    field: keyof ProviderFormState,
    value: string | NewModelFormState,
  ) => {
    // Do not save newModel field immediately, it is just a temporary state
    if (field === 'newModel') {
      setProviderForms(previous => ({
        ...previous,
        [provider]: {
          ...previous[provider],
          [field]: value as NewModelFormState,
        },
      }));
      return;
    }

    // Update form state
    setProviderForms(previous => ({
      ...previous,
      [provider]: {
        ...previous[provider],
        [field]: value,
      },
    }));

    // Update configuration to server immediately
    await debouncedUpdateProvider(provider, { [field]: value });
  };

  // Handle enabling/disabling a provider
  const handleProviderEnabledChange = async (provider: string, enabled: boolean) => {
    setProviderForms(previous => ({
      ...previous,
      [provider]: {
        ...previous[provider],
        enabled,
      },
    }));

    // Update server
    await debouncedUpdateProvider(provider, { enabled });

    if (enabled) {
      showMessage(t('Preference.ProviderEnabled'), 'success');
    } else {
      showMessage(t('Preference.ProviderDisabled'), 'info');
    }
  };

  // Model Operations
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<string>('');
  const [availableDefaultModels, setAvailableDefaultModels] = useState<ModelInfo[]>([]);
  const [selectedDefaultModel, setSelectedDefaultModel] = useState<string>('');

  // Open add model dialog
  const openAddModelDialog = (provider: string) => {
    if (!providerForms[provider]) {
      console.error(`Provider form for ${provider} is not initialized`);
      return;
    }

    setCurrentProvider(provider);

    // Get default models for this provider from defaultProviders.json
    const defaultProvider = defaultProvidersConfig.providers.find(p => p.provider === provider);
    if (defaultProvider) {
      // Filter out models that are already added
      const currentModels = providerForms[provider].models || [];
      const currentModelNames = currentModels.map(model => model.name);

      const filteredModels = defaultProvider.models
        .filter(model => !currentModelNames.includes(model.name))
        .map(model => ({
          ...model,
          features: model.features as ModelFeature[],
        }));

      setAvailableDefaultModels(filteredModels);

      // Default to empty selection
      setSelectedDefaultModel('');
    } else {
      setAvailableDefaultModels([]);
      setSelectedDefaultModel('');
    }

    setModelDialogOpen(true);
  };

  // Close model dialog and reset form
  const closeModelDialog = () => {
    setModelDialogOpen(false);
    setSelectedDefaultModel('');
    setCurrentProvider('');

    // Reset form if applicable
    if (currentProvider && providerForms[currentProvider]) {
      setProviderForms(previous => ({
        ...previous,
        [currentProvider]: {
          ...previous[currentProvider],
          newModel: { ...DEFAULT_NEW_MODEL },
        },
      }));
    }
  };

  // Handle model form field changes
  const handleModelFormChange = (
    provider: string,
    field: keyof NewModelFormState,
    value: string | ModelFeature[],
  ) => {
    if (!provider || !providerForms[provider]) {
      console.warn(`Provider form for ${provider} is not initialized, cannot update model form`);
      return;
    }

    setProviderForms(previous => ({
      ...previous,
      [provider]: {
        ...previous[provider],
        newModel: {
          ...previous[provider].newModel,
          [field]: value,
        },
      },
    }));
  };

  // Handle feature checkbox change
  const handleFeatureChange = (provider: string, feature: ModelFeature, checked: boolean) => {
    if (!provider || !providerForms[provider]) {
      console.warn(`Provider form for ${provider} is not initialized, cannot update feature`);
      return;
    }

    const formState = providerForms[provider];
    let newFeatures = [...formState.newModel.features];

    if (checked && !newFeatures.includes(feature)) {
      newFeatures.push(feature);
    } else if (!checked && newFeatures.includes(feature)) {
      newFeatures = newFeatures.filter(f => f !== feature);
    }

    handleModelFormChange(provider, 'features', newFeatures);
  };

  // Add model from dialog
  const handleAddModel = async () => {
    const provider = currentProvider;
    const formState = providerForms[provider];
    if (!formState) return;

    let newModel: ModelInfo;

    // Check if user selected an existing model
    if (selectedDefaultModel) {
      const selectedModel = availableDefaultModels.find(m => m.name === selectedDefaultModel);
      if (selectedModel) {
        newModel = { ...selectedModel };
      } else {
        return; // Should never happen
      }
    } else {
      // Use custom model data
      const { newModel: newModelForm } = formState;
      if (!newModelForm.name.trim()) {
        showMessage(t('Preference.ModelNameRequired'), 'error');
        return;
      }

      newModel = {
        name: newModelForm.name.trim(),
        caption: newModelForm.caption.trim() || newModelForm.name.trim(),
        features: newModelForm.features,
      };
    }

    const updatedModels = [...formState.models, newModel];

    setProviderForms(previous => ({
      ...previous,
      [provider]: {
        ...previous[provider],
        models: updatedModels,
        newModel: { ...DEFAULT_NEW_MODEL },
      },
    }));

    // Save immediately after adding
    await debouncedUpdateProvider(provider, { models: updatedModels });

    // Close dialog
    closeModelDialog();
  };

  // Remove a model
  const removeModel = async (provider: string, modelName: string) => {
    const formState = providerForms[provider];
    if (!formState) return;

    const updatedModels = formState.models.filter(model => model.name !== modelName);

    setProviderForms(previous => ({
      ...previous,
      [provider]: {
        ...previous[provider],
        models: updatedModels,
      },
    }));

    // Save immediately after removing
    await debouncedUpdateProvider(provider, { models: updatedModels });
  };

  return {
    providerForms,
    handleFormChange,
    handleProviderEnabledChange,
    modelDialogOpen,
    setModelDialogOpen,
    currentProvider,
    availableDefaultModels,
    selectedDefaultModel,
    setSelectedDefaultModel,
    openAddModelDialog,
    closeModelDialog,
    handleModelFormChange,
    handleFeatureChange,
    handleAddModel,
    removeModel,
  };
}
