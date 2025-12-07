import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, Snackbar, Tab, Tabs } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Dispatch, SetStateAction, SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import defaultProvidersConfig from '@services/externalAPI/defaultProviders';
import { AIProviderConfig, ModelFeature, ModelInfo } from '@services/externalAPI/interface';
import { ListItemVertical } from '../../../PreferenceComponents';
import { NewModelDialog } from './NewModelDialog';
import { NewProviderForm } from './NewProviderForm';
import { ProviderPanel } from './ProviderPanel';
import { a11yProps, TabPanel } from './TabPanel';

interface ProviderConfigProps {
  providers: AIProviderConfig[];
  setProviders: Dispatch<SetStateAction<AIProviderConfig[]>>;
  changeDefaultModel?: (provider: string, model: string) => Promise<void>;
  changeDefaultEmbeddingModel?: (provider: string, model: string) => Promise<void>;
  changeDefaultSpeechModel?: (provider: string, model: string) => Promise<void>;
  changeDefaultImageGenerationModel?: (provider: string, model: string) => Promise<void>;
  changeDefaultTranscriptionsModel?: (provider: string, model: string) => Promise<void>;
  changeDefaultFreeModel?: (provider: string, model: string) => Promise<void>;
}

// Add provider button styling
const AddProviderButton = styled(Button)`
  margin-top: 16px;
  margin-bottom: 8px;
  width: 100%;
`;

interface ProviderFormState {
  apiKey: string;
  baseURL: string;
  models: ModelInfo[];
  newModel: {
    name: string;
    caption: string;
    features: ModelFeature[];
    parameters?: Record<string, unknown>;
  };
}

/**
 * Note: Auto-fill default models logic has been moved to the backend (ExternalAPIService)
 * The backend will automatically fill in default models when a new model is added to a provider
 * Frontend doesn't need to handle this anymore, just listen to the Observable changes
 */

export function ProviderConfig({
  providers,
  setProviders,
  changeDefaultModel: _changeDefaultModel,
  changeDefaultEmbeddingModel: _changeDefaultEmbeddingModel,
  changeDefaultSpeechModel: _changeDefaultSpeechModel,
  changeDefaultImageGenerationModel: _changeDefaultImageGenerationModel,
  changeDefaultTranscriptionsModel: _changeDefaultTranscriptionsModel,
  changeDefaultFreeModel: _changeDefaultFreeModel,
}: ProviderConfigProps) {
  const { t } = useTranslation('agent');
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'info'>('success');

  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [newProviderForm, setNewProviderForm] = useState({
    provider: '',
    providerClass: 'openAICompatible',
    baseURL: '',
  });

  const [availableDefaultProviders, setAvailableDefaultProviders] = useState<AIProviderConfig[]>([]);
  const [selectedDefaultProvider, setSelectedDefaultProvider] = useState('');

  const [providerForms, setProviderForms] = useState<Record<string, ProviderFormState | undefined>>({});
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [editingModelName, setEditingModelName] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [selectedDefaultModel, setSelectedDefaultModel] = useState('');
  const [availableDefaultModels, setAvailableDefaultModels] = useState<ModelInfo[]>([]);

  // Update local providers and initialize form states
  useEffect(() => {
    const forms: Record<string, ProviderFormState> = {};
    providers.forEach(provider => {
      forms[provider.provider] = {
        apiKey: provider.apiKey || '',
        baseURL: provider.baseURL || '',
        models: [...provider.models],
        newModel: { name: '', caption: '', features: ['language' as ModelFeature] },
      };
    });
    setProviderForms(forms);
  }, [providers]);

  // Update available default providers
  useEffect(() => {
    const currentProviderNames = new Set(providers.map(p => p.provider));
    const filteredDefaultProviders = defaultProvidersConfig.providers.filter(
      p => !currentProviderNames.has(p.provider),
    ) as AIProviderConfig[];
    setAvailableDefaultProviders(filteredDefaultProviders);
  }, [providers]);

  const showMessage = (message: string, severity: 'success' | 'error' | 'info') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
  };

  const providerClasses = useMemo(() => {
    const classes = new Set<string>();
    defaultProvidersConfig.providers.forEach(p => {
      if (p.providerClass) classes.add(p.providerClass);
    });
    return Array.from(classes);
  }, []);

  const handleTabChange = (_event: SyntheticEvent, newValue: number) => {
    setSelectedTabIndex(newValue);
  };

  const handleFormChange = async (providerName: string, field: keyof AIProviderConfig, value: string) => {
    try {
      setProviderForms(previous => {
        const currentForm = previous[providerName];
        if (!currentForm) return previous;

        return {
          ...previous,
          [providerName]: {
            ...currentForm,
            [field]: value,
          } as ProviderFormState,
        };
      });
      await window.service.externalAPI.updateProvider(providerName, { [field]: value });
      showMessage(t('Preference.SettingsSaved'), 'success');
    } catch (error) {
      void window.service.native.log('error', 'Failed to update provider', { function: 'ProviderConfig.handleFormChange', error });
      showMessage(t('Preference.FailedToSaveSettings'), 'error');
    }
  };

  const handleProviderEnabledChange = async (providerName: string, enabled: boolean) => {
    try {
      setProviders(previous => previous.map(p => p.provider === providerName ? { ...p, enabled } : p));
      await window.service.externalAPI.updateProvider(providerName, { enabled });

      // existing logic: enabled flag saved and UI updated

      showMessage(enabled ? t('Preference.ProviderEnabled') : t('Preference.ProviderDisabled'), 'success');
    } catch (error) {
      void window.service.native.log('error', 'Failed to update provider status', { function: 'ProviderConfig.handleProviderEnabledChange', error });
      showMessage(t('Preference.FailedToUpdateProviderStatus'), 'error');
    }
  };

  const openAddModelDialog = (providerName: string) => {
    setCurrentProvider(providerName);
    const provider = defaultProvidersConfig.providers.find(p => p.provider === providerName) as AIProviderConfig | undefined;
    const currentModels = providerForms[providerName]?.models;
    const currentModelNames = new Set(currentModels?.map(m => m.name));

    if (provider) {
      setAvailableDefaultModels(provider.models.filter(m => !currentModelNames.has(m.name)));
    } else {
      const localProvider = providers.find(p => p.provider === providerName);
      if (localProvider) {
        const similarProviders = defaultProvidersConfig.providers.filter(
          p => p.providerClass === localProvider.providerClass,
        );
        const allModels: ModelInfo[] = [];
        similarProviders.forEach(p => {
          p.models.forEach(m => {
            if (!currentModelNames.has(m.name)) allModels.push(m as ModelInfo);
          });
        });
        setAvailableDefaultModels(allModels);
      } else {
        setAvailableDefaultModels([]);
      }
    }

    setSelectedDefaultModel('');
    setModelDialogOpen(true);
  };

  const closeModelDialog = () => {
    setModelDialogOpen(false);
    setCurrentProvider(null);
    setEditingModelName(null);
    setSelectedDefaultModel('');
  };

  const handleModelFormChange = (providerName: string, field: string, value: string | ModelFeature[] | Record<string, unknown>) => {
    setProviderForms(previous => {
      const currentForm = previous[providerName];
      if (!currentForm) return previous;

      return {
        ...previous,
        [providerName]: {
          ...currentForm,
          newModel: {
            ...currentForm.newModel,
            [field]: value,
          },
        } as ProviderFormState,
      };
    });
  };
  const handleFeatureChange = (providerName: string, feature: ModelFeature, checked: boolean) => {
    setProviderForms(previous => {
      const currentForm = previous[providerName];
      if (!currentForm) return previous;

      const newFeatures = [...currentForm.newModel.features];

      if (checked && !newFeatures.includes(feature)) {
        newFeatures.push(feature);
      } else if (!checked) {
        const index = newFeatures.indexOf(feature);
        if (index !== -1) {
          newFeatures.splice(index, 1);
        }
      }

      return {
        ...previous,
        [providerName]: {
          ...currentForm,
          newModel: {
            ...currentForm.newModel,
            features: newFeatures,
          } satisfies {
            name: string;
            caption: string;
            features: ModelFeature[];
          },
        } as ProviderFormState,
      };
    });
  };

  const handleEditModel = (providerName: string, modelName: string) => {
    const provider = providers.find(p => p.provider === providerName);
    if (!provider) return;

    const model = provider.models.find(m => m.name === modelName);
    if (!model) return;

    // Fill form with existing model data
    setProviderForms(previous => {
      const currentForm = previous[providerName];
      if (!currentForm) return previous;

      return {
        ...previous,
        [providerName]: {
          ...currentForm,
          newModel: {
            name: model.name,
            caption: model.caption || '',
            features: model.features || ['language' as ModelFeature],
            parameters: model.parameters || {},
          },
        } as ProviderFormState,
      };
    });

    setEditingModelName(modelName);
    setCurrentProvider(providerName);
    setSelectedDefaultModel('');
    setModelDialogOpen(true);
  };

  const handleAddModel = async () => {
    if (!currentProvider) return;

    try {
      const form = providerForms[currentProvider];
      if (!form) {
        showMessage(t('Preference.FailedToAddModel'), 'error');
        return;
      }

      // Create model with proper type checking using satisfies
      const newModel = {
        name: form.newModel.name,
        caption: form.newModel.caption || undefined,
        features: form.newModel.features,
        parameters: form.newModel.parameters,
      } satisfies ModelInfo;

      if (!newModel.name) {
        showMessage(t('Preference.ModelNameRequired'), 'error');
        return;
      }

      // In edit mode, check for duplicate names excluding the model being edited
      if (editingModelName) {
        if (form.models.some(m => m.name === newModel.name && m.name !== editingModelName)) {
          showMessage(t('Preference.ModelAlreadyExists'), 'error');
          return;
        }
      } else {
        if (form.models.some(m => m.name === newModel.name)) {
          showMessage(t('Preference.ModelAlreadyExists'), 'error');
          return;
        }
      }

      // In edit mode, update existing model; otherwise add new model
      const updatedModels = editingModelName
        ? form.models.map(m => m.name === editingModelName ? newModel : m)
        : [...form.models, newModel];

      setProviderForms(previous => {
        const currentForm = previous[currentProvider];
        if (!currentForm) return previous;

        return {
          ...previous,
          [currentProvider]: {
            ...currentForm,
            models: updatedModels,
            newModel: {
              name: '',
              caption: '',
              features: ['language' as ModelFeature],
              parameters: {},
            },
          } as ProviderFormState,
        };
      });

      const provider = providers.find(p => p.provider === currentProvider);
      if (provider) {
        await window.service.externalAPI.updateProvider(currentProvider, {
          models: updatedModels,
        });

        setProviders(previous => previous.map(p => p.provider === currentProvider ? { ...p, models: updatedModels } : p));

        showMessage(editingModelName ? t('Preference.ModelUpdatedSuccessfully') : t('Preference.ModelAddedSuccessfully'), 'success');
        closeModelDialog();
      }
    } catch (error) {
      void window.service.native.log('error', editingModelName ? 'Failed to update model' : 'Failed to add model', {
        function: 'ProviderConfig.handleAddModel',
        error,
      });
      showMessage(editingModelName ? t('Preference.FailedToUpdateModel') : t('Preference.FailedToAddModel'), 'error');
    }
  };

  const removeModel = async (providerName: string, modelName: string) => {
    try {
      const form = providerForms[providerName];
      if (!form) {
        showMessage(t('Preference.FailedToRemoveModel'), 'error');
        return;
      }

      const updatedModels = form.models.filter(m => m.name !== modelName);

      setProviderForms(previous => {
        const currentForm = previous[providerName];
        if (!currentForm) return previous;

        return {
          ...previous,
          [providerName]: {
            ...currentForm,
            models: updatedModels,
          } as ProviderFormState,
        };
      });

      await window.service.externalAPI.updateProvider(providerName, {
        models: updatedModels,
      });

      setProviders(previous => previous.map(p => p.provider === providerName ? { ...p, models: updatedModels } : p));

      showMessage(t('Preference.ModelRemovedSuccessfully'), 'success');
    } catch (error) {
      void window.service.native.log('error', 'Failed to remove model', { function: 'ProviderConfig.removeModel', error });
      showMessage(t('Preference.FailedToRemoveModel'), 'error');
    }
  };

  const handleAddProvider = async () => {
    try {
      if (!newProviderForm.provider.trim()) {
        showMessage(t('Preference.ProviderNameRequired'), 'error');
        return;
      }

      if (providers.some(p => p.provider === newProviderForm.provider)) {
        showMessage(t('Preference.ProviderAlreadyExists'), 'error');
        return;
      }

      if (newProviderForm.providerClass === 'openAICompatible' && !newProviderForm.baseURL) {
        showMessage(t('Preference.BaseURLRequired'), 'error');
        return;
      }

      // Find selected default provider (user explicit choice) to get appropriate default models
      let defaultModel: ModelInfo | undefined;
      let embeddingModel: ModelInfo | undefined;
      let speechModel: ModelInfo | undefined;
      let imageGenerationModel: ModelInfo | undefined;
      let transcriptionsModel: ModelInfo | undefined;
      const selectedPresetProvider = availableDefaultProviders.find(p => p.provider === selectedDefaultProvider);

      // Helper function to clone a model with new provider name
      const cloneModelForProvider = (baseModel: ModelInfo, newProviderName: string): ModelInfo => {
        const typedFeatures: ModelFeature[] = Array.isArray(baseModel.features) ? baseModel.features.map(f => f) : [];
        const clonedModel: ModelInfo = {
          name: baseModel.name,
          caption: `${baseModel.caption || baseModel.name} (${newProviderName})`,
          features: typedFeatures,
        };
        if ('metadata' in baseModel && baseModel.metadata) {
          clonedModel.metadata = { ...baseModel.metadata };
        }
        return clonedModel;
      };

      // If the user selected a preset provider, use its first model as the default
      if (selectedPresetProvider && selectedPresetProvider.models.length > 0) {
        // Clone the first model from the similar provider
        const baseModel = selectedPresetProvider.models[0];
        defaultModel = cloneModelForProvider(baseModel, newProviderForm.provider);

        // Look for an embedding model in the same provider
        const baseEmbeddingModel = selectedPresetProvider.models.find(
          model => Array.isArray(model.features) && model.features.includes('embedding'),
        );
        if (baseEmbeddingModel) {
          embeddingModel = cloneModelForProvider(baseEmbeddingModel, newProviderForm.provider);
        }

        // Look for a speech model in the same provider
        const baseSpeechModel = selectedPresetProvider.models.find(
          model => Array.isArray(model.features) && model.features.includes('speech'),
        );
        if (baseSpeechModel) {
          speechModel = cloneModelForProvider(baseSpeechModel, newProviderForm.provider);
        }

        // Look for an image generation model in the same provider
        const baseImageGenerationModel = selectedPresetProvider.models.find(
          model => Array.isArray(model.features) && model.features.includes('imageGeneration'),
        );
        if (baseImageGenerationModel) {
          imageGenerationModel = cloneModelForProvider(baseImageGenerationModel, newProviderForm.provider);
        }

        // Look for a transcriptions model in the same provider
        const baseTranscriptionsModel = selectedPresetProvider.models.find(
          model => Array.isArray(model.features) && model.features.includes('transcriptions'),
        );
        if (baseTranscriptionsModel) {
          transcriptionsModel = cloneModelForProvider(baseTranscriptionsModel, newProviderForm.provider);
        }
      }
      // If no similar provider found, don't create default models

      // Create new provider configuration with type checking using satisfies
      const modelsToAdd: ModelInfo[] = [];
      if (defaultModel) modelsToAdd.push(defaultModel);
      if (embeddingModel && embeddingModel.name !== defaultModel?.name) {
        modelsToAdd.push(embeddingModel);
      }
      if (speechModel && speechModel.name !== defaultModel?.name && speechModel.name !== embeddingModel?.name) {
        modelsToAdd.push(speechModel);
      }
      if (
        imageGenerationModel &&
        imageGenerationModel.name !== defaultModel?.name &&
        imageGenerationModel.name !== embeddingModel?.name &&
        imageGenerationModel.name !== speechModel?.name
      ) {
        modelsToAdd.push(imageGenerationModel);
      }
      if (
        transcriptionsModel &&
        transcriptionsModel.name !== defaultModel?.name &&
        transcriptionsModel.name !== embeddingModel?.name &&
        transcriptionsModel.name !== speechModel?.name &&
        transcriptionsModel.name !== imageGenerationModel?.name
      ) {
        modelsToAdd.push(transcriptionsModel);
      }

      const newProvider = {
        provider: newProviderForm.provider,
        providerClass: newProviderForm.providerClass,
        baseURL: newProviderForm.baseURL,
        models: modelsToAdd, // Add both default and embedding models if available
        // If user selected a preset provider, mark new provider as preset
        isPreset: Boolean(selectedPresetProvider),
        enabled: true,
      } satisfies AIProviderConfig;

      await window.service.externalAPI.updateProvider(newProviderForm.provider, newProvider);
      const updatedProviders = [...providers, newProvider];
      setProviders(updatedProviders);
      setProviderForms(previous => ({
        ...previous,
        [newProvider.provider]: {
          apiKey: '',
          baseURL: newProvider.baseURL || '',
          models: newProvider.models,
          newModel: {
            name: '',
            caption: '',
            features: ['language' as ModelFeature],
          },
        },
      }));
      setSelectedTabIndex(updatedProviders.length - 1);
      setNewProviderForm({ provider: '', providerClass: 'openAICompatible', baseURL: '' });

      setShowAddProviderForm(false);
      showMessage(t('Preference.ProviderAddedSuccessfully'), 'success');
    } catch (error) {
      void window.service.native.log('error', 'Failed to add provider', { function: 'ProviderConfig.handleAddProvider', error });
      showMessage(t('Preference.FailedToAddProvider'), 'error');
    }
  };

  const handleDeleteProvider = async (providerName: string) => {
    try {
      if (!window.confirm(t('Preference.ConfirmDeleteProvider', { providerName }))) {
        return;
      }

      // Remove provider from backend
      await window.service.externalAPI.deleteProvider(providerName);

      const updatedProviders = providers.filter(p => p.provider !== providerName);
      setProviders(updatedProviders);

      // Remove from local forms state
      setProviderForms(previous => {
        const { [providerName]: _, ...newForms } = previous;
        return newForms;
      });

      // Adjust selected tab if needed
      if (selectedTabIndex >= updatedProviders.length && updatedProviders.length > 0) {
        setSelectedTabIndex(updatedProviders.length - 1);
      } else if (updatedProviders.length === 0) {
        setSelectedTabIndex(0);
      }

      showMessage(t('Preference.ProviderDeleted', { providerName }), 'success');
    } catch (error) {
      void window.service.native.log('error', 'Failed to delete provider', {
        function: 'ProviderConfig.handleDeleteProvider',
        error,
      });
      showMessage(t('Preference.FailedToDeleteProvider', { providerName }), 'error');
    }
  };

  const handleDefaultProviderSelect = (providerName: string) => {
    setSelectedDefaultProvider(providerName);
    if (!providerName) {
      setNewProviderForm({ provider: '', providerClass: 'openAICompatible', baseURL: '' });
      return;
    }
    const selectedProvider = availableDefaultProviders.find(p => p.provider === providerName);
    if (selectedProvider) {
      setNewProviderForm({
        provider: selectedProvider.provider,
        providerClass: selectedProvider.providerClass || 'openAICompatible',
        baseURL: selectedProvider.baseURL || '',
      });
    }
  };

  const addProviderSection = (
    <>
      <AddProviderButton
        variant='outlined'
        startIcon={<AddIcon />}
        onClick={() => {
          setShowAddProviderForm(!showAddProviderForm);
        }}
        data-testid='add-new-provider-button'
      >
        {showAddProviderForm ? t('Preference.CancelAddProvider') : t('Preference.AddNewProvider')}
      </AddProviderButton>
      {showAddProviderForm && (
        <NewProviderForm
          formState={newProviderForm}
          providerClasses={providerClasses}
          availableDefaultProviders={availableDefaultProviders}
          selectedDefaultProvider={selectedDefaultProvider}
          onDefaultProviderSelect={handleDefaultProviderSelect}
          onChange={updates => {
            setNewProviderForm(previous => ({ ...previous, ...updates }));
          }}
          onSubmit={handleAddProvider}
        />
      )}
    </>
  );

  if (providers.length === 0) {
    return (
      <ListItemVertical>
        <ListItemText
          primary={t('Preference.ProviderConfiguration')}
          secondary={t('Preference.NoProvidersAvailable')}
        />
        {addProviderSection}
      </ListItemVertical>
    );
  }

  return (
    <ListItemVertical>
      <ListItemText
        primary={t('Preference.ProviderConfiguration')}
        secondary={t('Preference.ProviderConfigurationDescription')}
      />
      {addProviderSection}
      <Box sx={{ flexGrow: 1, bgcolor: 'background.paper', display: 'flex', width: '100%', marginTop: 2 }}>
        <Tabs
          orientation='vertical'
          variant='scrollable'
          value={selectedTabIndex}
          onChange={handleTabChange}
          aria-label='Provider configuration tabs'
          sx={{
            borderRight: 1,
            borderColor: 'divider',
            minWidth: 120,
            '& .MuiTab-root': { alignItems: 'flex-start', textAlign: 'left', paddingLeft: 2 },
          }}
        >
          {providers.map((provider, index) => (
            <Tab
              key={provider.provider}
              label={provider.provider}
              {...a11yProps(index)}
              sx={{
                opacity: provider.enabled === false ? 0.6 : 1,
                fontStyle: provider.enabled === false ? 'italic' : 'normal',
              }}
            />
          ))}
        </Tabs>
        {providers.map((provider, index) => {
          const formState = providerForms[provider.provider];
          if (!formState) {
            return (
              <TabPanel key={provider.provider} value={selectedTabIndex} index={index}>
                Loading...
              </TabPanel>
            );
          }
          return (
            <TabPanel key={provider.provider} value={selectedTabIndex} index={index}>
              <ProviderPanel
                provider={provider}
                formState={formState}
                onFormChange={(field, value) => handleFormChange(provider.provider, field as keyof AIProviderConfig, value)}
                onEnabledChange={enabled => handleProviderEnabledChange(provider.provider, enabled)}
                onRemoveModel={modelName => removeModel(provider.provider, modelName)}
                onEditModel={modelName => {
                  handleEditModel(provider.provider, modelName);
                }}
                onOpenAddModelDialog={() => {
                  openAddModelDialog(provider.provider);
                }}
                onDeleteProvider={() => {
                  void handleDeleteProvider(provider.provider);
                }}
              />
            </TabPanel>
          );
        })}
      </Box>
      <NewModelDialog
        open={modelDialogOpen}
        onClose={closeModelDialog}
        onAddModel={handleAddModel}
        currentProvider={currentProvider}
        providerClass={currentProvider ? providers.find(p => p.provider === currentProvider)?.providerClass : undefined}
        newModelForm={currentProvider && providerForms[currentProvider]
          ? providerForms[currentProvider].newModel
          : { name: '', caption: '', features: ['language' as ModelFeature], parameters: {} }}
        availableDefaultModels={availableDefaultModels}
        selectedDefaultModel={selectedDefaultModel}
        onSelectDefaultModel={setSelectedDefaultModel}
        onModelFormChange={(field, value) => {
          if (currentProvider) handleModelFormChange(currentProvider, field, value);
        }}
        onFeatureChange={(feature, checked) => {
          if (currentProvider) handleFeatureChange(currentProvider, feature, checked);
        }}
        editMode={!!editingModelName}
      />
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </ListItemVertical>
  );
}
