import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, Snackbar, Tab, Tabs } from '@mui/material';
import { Dispatch, SetStateAction, SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ListItemText } from '@/components/ListItem';
import defaultProvidersConfig from '@services/externalAPI/defaultProviders.json';
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
  };
}

export function ProviderConfig({ providers, setProviders, changeDefaultModel }: ProviderConfigProps) {
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

  const [providerForms, setProviderForms] = useState<Record<string, ProviderFormState>>({});
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
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
      setProviderForms(previous => ({
        ...previous,
        [providerName]: { ...previous[providerName], [field]: value },
      }));
      await window.service.externalAPI.updateProvider(providerName, { [field]: value });
      showMessage(t('Preference.SettingsSaved'), 'success');
    } catch (error) {
      console.error('Failed to update provider:', error);
      showMessage(t('Preference.FailedToSaveSettings'), 'error');
    }
  };

  const handleProviderEnabledChange = async (providerName: string, enabled: boolean) => {
    try {
      setProviders(previous => previous.map(p => p.provider === providerName ? { ...p, enabled } : p));
      await window.service.externalAPI.updateProvider(providerName, { enabled });
      showMessage(enabled ? t('Preference.ProviderEnabled') : t('Preference.ProviderDisabled'), 'success');
    } catch (error) {
      console.error('Failed to update provider status:', error);
      showMessage(t('Preference.FailedToUpdateProviderStatus'), 'error');
    }
  };

  const openAddModelDialog = (providerName: string) => {
    setCurrentProvider(providerName);
    const provider = defaultProvidersConfig.providers.find(p => p.provider === providerName) as AIProviderConfig | undefined;
    const currentModels = providerForms[providerName].models || [];
    const currentModelNames = new Set(currentModels.map(m => m.name));

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
  };

  const handleModelFormChange = (providerName: string, field: string, value: string | ModelFeature[]) => {
    setProviderForms(previous => ({
      ...previous,
      [providerName]: {
        ...previous[providerName],
        newModel: {
          ...previous[providerName].newModel,
          [field]: value,
        },
      },
    }));
  };

  const handleFeatureChange = (providerName: string, feature: ModelFeature, checked: boolean) => {
    setProviderForms(previous => {
      const newFeatures = [...previous[providerName].newModel.features];

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
          ...previous[providerName],
          newModel: {
            ...previous[providerName].newModel,
            features: newFeatures,
          },
        },
      };
    });
  };

  const handleAddModel = async () => {
    if (!currentProvider) return;

    try {
      const form = providerForms[currentProvider];
      const newModel: ModelInfo = {
        name: form.newModel.name,
        caption: form.newModel.caption || undefined,
        features: form.newModel.features,
      };

      if (!newModel.name) {
        showMessage(t('Preference.ModelNameRequired'), 'error');
        return;
      }

      if (form.models.some(m => m.name === newModel.name)) {
        showMessage(t('Preference.ModelAlreadyExists'), 'error');
        return;
      }

      const updatedModels = [...form.models, newModel];
      setProviderForms(previous => ({
        ...previous,
        [currentProvider]: {
          ...previous[currentProvider],
          models: updatedModels,
          newModel: {
            name: '',
            caption: '',
            features: ['language' as ModelFeature],
          },
        },
      }));

      const provider = providers.find(p => p.provider === currentProvider);
      if (provider) {
        await window.service.externalAPI.updateProvider(currentProvider, {
          models: updatedModels,
        });

        setProviders(previous => previous.map(p => p.provider === currentProvider ? { ...p, models: updatedModels } : p));

        try {
          // Get current default configuration
          const defaultConfig = await window.service.externalAPI.getAIConfig();
          // If default configuration doesn't have a model or provider set, or this is the first model,
          // set the newly added model as default using the changeDefaultModel function
          if ((!defaultConfig.api.model || !defaultConfig.api.provider || provider.models.length === 0) && changeDefaultModel) {
            await changeDefaultModel(currentProvider, newModel.name);
          }
        } catch (configError) {
          console.error('Failed to update default model config:', configError);
        }

        showMessage(t('Preference.ModelAddedSuccessfully'), 'success');
        closeModelDialog();
      }
    } catch (error) {
      console.error('Failed to add model:', error);
      showMessage(t('Preference.FailedToAddModel'), 'error');
    }
  };

  const removeModel = async (providerName: string, modelName: string) => {
    try {
      const form = providerForms[providerName];
      const updatedModels = form.models.filter(m => m.name !== modelName);

      setProviderForms(previous => ({
        ...previous,
        [providerName]: {
          ...previous[providerName],
          models: updatedModels,
        },
      }));

      await window.service.externalAPI.updateProvider(providerName, {
        models: updatedModels,
      });

      setProviders(previous => previous.map(p => p.provider === providerName ? { ...p, models: updatedModels } : p));

      showMessage(t('Preference.ModelRemovedSuccessfully'), 'success');
    } catch (error) {
      console.error('Failed to remove model:', error);
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

      const newProvider: AIProviderConfig = {
        provider: newProviderForm.provider,
        providerClass: newProviderForm.providerClass,
        baseURL: newProviderForm.baseURL,
        models: [],
        isPreset: false,
        enabled: true,
      };

      await window.service.externalAPI.updateProvider(newProviderForm.provider, newProvider);
      const updatedProviders = [...providers, newProvider];
      setProviders(updatedProviders);
      setProviderForms(previous => ({
        ...previous,
        [newProvider.provider]: {
          apiKey: '',
          baseURL: newProvider.baseURL || '',
          models: [],
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
      console.error('Failed to add provider:', error);
      showMessage(t('Preference.FailedToAddProvider'), 'error');
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
                onOpenAddModelDialog={() => {
                  openAddModelDialog(provider.provider);
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
        newModelForm={(currentProvider && providerForms[currentProvider])
          ? providerForms[currentProvider].newModel
          : { name: '', caption: '', features: ['language'] }}
        availableDefaultModels={availableDefaultModels}
        selectedDefaultModel={selectedDefaultModel}
        onSelectDefaultModel={setSelectedDefaultModel}
        onModelFormChange={(field, value) => {
          if (currentProvider) handleModelFormChange(currentProvider, field, value);
        }}
        onFeatureChange={(feature, checked) => {
          if (currentProvider) handleFeatureChange(currentProvider, feature, checked);
        }}
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
