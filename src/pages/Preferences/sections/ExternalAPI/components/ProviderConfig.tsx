import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, Snackbar, Tab, Tabs } from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ListItemText } from '@/components/ListItem';
import defaultProvidersConfig from '@services/agent/defaultProviders.json';
import { AIProviderConfig } from '@services/agent/interface';
import { ListItemVertical } from '../../../PreferenceComponents';
import { useProviderForms } from '../hooks/useProviderForms';
import { ModelDialog } from './ModelDialog';
import { NewProviderForm } from './NewProviderForm';
import { ProviderPanel } from './ProviderPanel';
import { a11yProps, TabPanel } from './TabPanel';

interface ProviderConfigProps {
  providers: AIProviderConfig[];
}

// Add provider button styling
const AddProviderButton = styled(Button)`
  margin-top: 16px;
  margin-bottom: 8px;
  width: 100%;
`;

export function ProviderConfig({ providers }: ProviderConfigProps) {
  const { t } = useTranslation('agent');
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'info'>('success');

  // Add new provider state
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [newProviderForm, setNewProviderForm] = useState({
    provider: '',
    providerClass: 'openAICompatible',
    baseURL: '',
  });

  // Maintain local providers list
  const [localProviders, setLocalProviders] = useState<AIProviderConfig[]>(providers);

  React.useEffect(() => {
    setLocalProviders(providers);
  }, [providers]);

  // Show message helper
  const showMessage = (message: string, severity: 'success' | 'error' | 'info') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  // Handle Snackbar close
  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
  };

  // Use provider forms hook
  const {
    providerForms,
    handleFormChange,
    handleProviderEnabledChange,
    modelDialogOpen,
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
  } = useProviderForms(localProviders, showMessage);

  // 从配置文件中提取所有唯一提供方类型
  const providerClasses = React.useMemo(() => {
    const classes = new Set<string>();
    defaultProvidersConfig.providers.forEach(p => {
      if (p.providerClass) {
        classes.add(p.providerClass);
      }
    });
    return Array.from(classes);
  }, []);

  // Handle tab change
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTabIndex(newValue);
  };

  // Add new provider
  const handleAddProvider = async () => {
    try {
      // Validation
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

      // Create new provider
      const newProvider: AIProviderConfig = {
        provider: newProviderForm.provider,
        providerClass: newProviderForm.providerClass,
        baseURL: newProviderForm.baseURL,
        models: [],
        isPreset: false,
      };

      // Update server and local state
      await window.service.agent.updateProvider(newProviderForm.provider, newProvider);
      setLocalProviders(previous => [...previous, newProvider]);

      // Reset form and show success
      setSelectedTabIndex(localProviders.length);
      setNewProviderForm({ provider: '', providerClass: 'openAICompatible', baseURL: '' });
      setShowAddProviderForm(false);
      showMessage(t('Preference.ProviderAddedSuccessfully'), 'success');
    } catch (error) {
      console.error('Failed to add provider:', error);
      showMessage(t('Preference.FailedToAddProvider'), 'error');
    }
  };

  if (providers.length === 0) {
    return (
      <ListItemVertical>
        <ListItemText
          primary={t('Preference.ProviderConfiguration')}
          secondary={t('Preference.NoProvidersAvailable')}
        />
      </ListItemVertical>
    );
  }

  return (
    <ListItemVertical>
      <ListItemText
        primary={t('Preference.ProviderConfiguration')}
        secondary={t('Preference.ProviderConfigurationDescription')}
      />

      {/* Add new provider button */}
      <AddProviderButton
        variant='outlined'
        startIcon={<AddIcon />}
        onClick={() => {
          setShowAddProviderForm(!showAddProviderForm);
        }}
      >
        {showAddProviderForm ? t('Preference.CancelAddProvider') : t('Preference.AddNewProvider')}
      </AddProviderButton>

      {/* New provider form */}
      {showAddProviderForm && (
        <NewProviderForm
          formState={newProviderForm}
          providerClasses={providerClasses}
          onChange={updates => {
            setNewProviderForm(previous => ({ ...previous, ...updates }));
          }}
          onSubmit={handleAddProvider}
        />
      )}

      {/* Providers tabs */}
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
            '& .MuiTab-root': {
              alignItems: 'flex-start',
              textAlign: 'left',
              paddingLeft: 2,
            },
          }}
        >
          {localProviders.map((provider, index) => (
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

        {/* Provider content panels */}
        {localProviders.map((provider, index) => {
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
                onFormChange={(field, value) => {
                  handleFormChange(provider.provider, field, value);
                }}
                onEnabledChange={(enabled) => {
                  handleProviderEnabledChange(provider.provider, enabled);
                }}
                onRemoveModel={(modelName) => {
                  removeModel(provider.provider, modelName);
                }}
                onOpenAddModelDialog={() => {
                  openAddModelDialog(provider.provider);
                }}
              />
            </TabPanel>
          );
        })}
      </Box>

      {/* Model dialog */}
      <ModelDialog
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
          if (currentProvider) {
            handleModelFormChange(currentProvider, field, value);
          }
        }}
        onFeatureChange={(feature, checked) => {
          if (currentProvider) {
            handleFeatureChange(currentProvider, feature, checked);
          }
        }}
      />

      {/* Notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </ListItemVertical>
  );
}
