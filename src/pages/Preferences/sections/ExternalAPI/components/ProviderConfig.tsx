/* eslint-disable @typescript-eslint/no-floating-promises */
import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, Snackbar, Tab, Tabs } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ListItemText } from '@/components/ListItem';
import defaultProvidersConfig from '@services/externalAPI/defaultProviders.json';
import { AIProviderConfig, ModelFeature, ModelInfo } from '@services/externalAPI/interface';
import { ListItemVertical } from '../../../PreferenceComponents';
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

// 表单状态接口
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

  // 表单状态
  const [providerForms, setProviderForms] = useState<Record<string, ProviderFormState>>({});

  // 模型对话框状态
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [selectedDefaultModel, setSelectedDefaultModel] = useState('');
  const [availableDefaultModels, setAvailableDefaultModels] = useState<ModelInfo[]>([]);

  // 当提供者列表变化时更新本地状态
  useEffect(() => {
    setLocalProviders(providers);

    // 初始化每个提供者的表单状态
    const forms: Record<string, ProviderFormState> = {};
    providers.forEach(provider => {
      forms[provider.provider] = {
        apiKey: provider.apiKey || '',
        baseURL: provider.baseURL || '',
        models: [...provider.models],
        newModel: {
          name: '',
          caption: '',
          features: ['language' as ModelFeature],  // 显式指定类型
        },
      };
    });
    setProviderForms(forms);
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

  // 处理表单字段变更
  const handleFormChange = async (providerName: string, field: keyof AIProviderConfig, value: string) => {
    try {
      // 更新本地状态
      setProviderForms(previous => ({
        ...previous,
        [providerName]: {
          ...previous[providerName],
          [field]: value,
        },
      }));

      // 更新服务器状态
      const providerToUpdate: AIProviderConfig = { ...localProviders.find(p => p.provider === providerName)! };
      providerToUpdate[field] = value;
      await window.service.externalAPI.updateProvider(providerName, { [field]: value });

      showMessage(t('Preference.SettingsSaved'), 'success');
    } catch (error) {
      console.error('Failed to update provider:', error);
      showMessage(t('Preference.FailedToSaveSettings'), 'error');
    }
  };

  // 处理启用/禁用提供者
  const handleProviderEnabledChange = async (providerName: string, enabled: boolean) => {
    try {
      // 更新本地状态
      setLocalProviders(previous => previous.map(p => p.provider === providerName ? { ...p, enabled } : p));

      // 更新服务器状态
      await window.service.externalAPI.updateProvider(providerName, { enabled });

      showMessage(
        enabled
          ? t('Preference.ProviderEnabled')
          : t('Preference.ProviderDisabled'),
        'success',
      );
    } catch (error) {
      console.error('Failed to update provider status:', error);
      showMessage(t('Preference.FailedToUpdateProviderStatus'), 'error');
    }
  };

  // 打开添加模型对话框
  const openAddModelDialog = (providerName: string) => {
    setCurrentProvider(providerName);

    // 获取当前提供者的默认模型列表，排除已添加的
    const provider = defaultProvidersConfig.providers.find(p => p.provider === providerName);
    const currentModels = providerForms[providerName].models || [];
    const currentModelNames = new Set(currentModels.map(m => m.name));

    if (provider) {
      // 如果是预设提供者，从默认配置获取模型
      setAvailableDefaultModels(
        provider.models.filter(m => !currentModelNames.has(m.name)),
      );
    } else {
      // 否则尝试找到相同providerClass的提供者获取模型
      const localProvider = localProviders.find(p => p.provider === providerName);
      if (localProvider) {
        const similarProviders = defaultProvidersConfig.providers.filter(
          p => p.providerClass === localProvider.providerClass,
        );

        const allModels: ModelInfo[] = [];
        similarProviders.forEach(p => {
          p.models.forEach(m => {
            if (!currentModelNames.has(m.name)) {
              allModels.push(m);
            }
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

  // 关闭模型对话框
  const closeModelDialog = () => {
    setModelDialogOpen(false);
    setCurrentProvider(null);
  };

  // 处理模型表单变更
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

  // 处理模型特性变更
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

  // 添加模型
  const handleAddModel = async () => {
    if (!currentProvider) return;

    try {
      const form = providerForms[currentProvider];
      // 直接使用已正确类型化的features
      const newModel: ModelInfo = {
        name: form.newModel.name,
        caption: form.newModel.caption || undefined,
        features: form.newModel.features,  // 已经是 ModelFeature[]，不需要映射
      };

      if (!newModel.name) {
        showMessage(t('Preference.ModelNameRequired'), 'error');
        return;
      }

      // 检查是否已有同名模型
      if (form.models.some(m => m.name === newModel.name)) {
        showMessage(t('Preference.ModelAlreadyExists'), 'error');
        return;
      }

      // 更新本地状态
      const updatedModels = [...form.models, newModel];
      setProviderForms(previous => ({
        ...previous,
        [currentProvider]: {
          ...previous[currentProvider],
          models: updatedModels,
          newModel: {
            name: '',
            caption: '',
            features: ['language' as ModelFeature],  // 显式指定类型
          },
        },
      }));

      // 更新服务器状态
      const provider = localProviders.find(p => p.provider === currentProvider);
      if (provider) {
        await window.service.externalAPI.updateProvider(currentProvider, {
          models: updatedModels,
        });

        // 更新本地providers
        setLocalProviders(previous => previous.map(p => p.provider === currentProvider ? { ...p, models: updatedModels } : p));

        showMessage(t('Preference.ModelAddedSuccessfully'), 'success');
        closeModelDialog();
      }
    } catch (error) {
      console.error('Failed to add model:', error);
      showMessage(t('Preference.FailedToAddModel'), 'error');
    }
  };

  // 移除模型
  const removeModel = async (providerName: string, modelName: string) => {
    try {
      const form = providerForms[providerName];
      const updatedModels = form.models.filter(m => m.name !== modelName);

      // 更新本地状态
      setProviderForms(previous => ({
        ...previous,
        [providerName]: {
          ...previous[providerName],
          models: updatedModels,
        },
      }));

      // 更新服务器状态
      await window.service.externalAPI.updateProvider(providerName, {
        models: updatedModels,
      });

      // 更新本地providers
      setLocalProviders(previous => previous.map(p => p.provider === providerName ? { ...p, models: updatedModels } : p));

      showMessage(t('Preference.ModelRemovedSuccessfully'), 'success');
    } catch (error) {
      console.error('Failed to remove model:', error);
      showMessage(t('Preference.FailedToRemoveModel'), 'error');
    }
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
        enabled: true,
      };

      // Update server and local state
      await window.service.externalAPI.updateProvider(newProviderForm.provider, newProvider);
      setLocalProviders(previous => [...previous, newProvider]);

      // 初始化该提供者的表单状态
      setProviderForms(previous => ({
        ...previous,
        [newProvider.provider]: {
          apiKey: '',
          baseURL: newProvider.baseURL || '',
          models: [],
          newModel: {
            name: '',
            caption: '',
            features: ['language' as ModelFeature],  // 显式指定类型
          },
        },
      }));

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
