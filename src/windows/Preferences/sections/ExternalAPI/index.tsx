import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import TuneIcon from '@mui/icons-material/Tune';
import { Button, List } from '@mui/material';

import { ListItemText } from '@/components/ListItem';
import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import { ListItemVertical, Paper, SectionTitle } from '../../PreferenceComponents';
import type { ISectionProps } from '../../useSections';
import { AIModelParametersDialog } from './components/AIModelParametersDialog';
import { ModelSelector } from './components/ModelSelector';
import { ProviderConfig } from './components/ProviderConfig';
import { useAIConfigManagement } from './useAIConfigManagement';

export function ExternalAPI(props: Partial<ISectionProps>): React.JSX.Element {
  const { t } = useTranslation('agent');
  const { loading, config, providers, setProviders, handleModelChange, handleEmbeddingModelChange, handleConfigChange } = useAIConfigManagement();
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);

  const openParametersDialog = () => {
    setParametersDialogOpen(true);
  };

  const closeParametersDialog = () => {
    setParametersDialogOpen(false);
  };

  const handleModelClear = async () => {
    if (!config) return;

    try {
      // Only delete the model field, keep the provider if there's an embedding model using it
      await window.service.externalAPI.deleteFieldFromDefaultAIConfig('api.model');

      // Check if we should also clear the provider
      // Only clear provider if there's no embedding model set
      if (!config.api.embeddingModel) {
        await window.service.externalAPI.deleteFieldFromDefaultAIConfig('api.provider');
      }

      // For frontend state, we use empty strings to indicate "no selection"
      // The ModelSelector component should handle empty strings by showing no selection
      const updatedConfig = {
        ...config,
        api: {
          ...config.api,
          // Always clear the model
          model: '',
          // Only clear provider if no embedding model exists
          provider: config.api.embeddingModel ? config.api.provider : '',
        },
      };

      // Update local state - this will show no selection in the UI
      await handleConfigChange(updatedConfig);
    } catch (error) {
      console.error('Failed to clear model configuration:', error);
    }
  };

  const handleEmbeddingModelClear = async () => {
    if (!config) return;

    // Use the new API to delete the embeddingModel field
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('api.embeddingModel');

    // Update local state to reflect the change
    const { embeddingModel: _, ...apiWithoutEmbeddingModel } = config.api;
    const updatedConfig = {
      ...config,
      api: apiWithoutEmbeddingModel,
    };
    await handleConfigChange(updatedConfig);
  };

  // Create embedding config from current AI config
  const embeddingConfig = config
    ? {
      api: {
        provider: config.api.provider,
        model: config.api.embeddingModel || config.api.model,
        embeddingModel: config.api.embeddingModel,
      },
      modelParameters: config.modelParameters,
    }
    : null;

  return (
    <>
      <SectionTitle ref={props.sections?.externalAPI.ref}>{t('Preference.ExternalAPI')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {loading ? <ListItemVertical>{t('Loading')}</ListItemVertical> : (
            <>
              {providers.length > 0 && (
                <>
                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.DefaultAIModelSelection')}
                      secondary={t('Preference.DefaultAIModelSelectionDescription')}
                    />
                    <ModelSelector
                      selectedConfig={config}
                      modelOptions={providers.flatMap(provider =>
                        provider.models
                          .filter(model => Array.isArray(model.features) && model.features.includes('language'))
                          .map(model => [provider, model] as [AIProviderConfig, ModelInfo])
                      )}
                      onChange={handleModelChange}
                      onClear={handleModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.DefaultEmbeddingModelSelection')}
                      secondary={t('Preference.DefaultEmbeddingModelSelectionDescription')}
                    />
                    <ModelSelector
                      selectedConfig={embeddingConfig}
                      modelOptions={providers.flatMap(provider =>
                        provider.models
                          .filter(model => Array.isArray(model.features) && model.features.includes('embedding'))
                          .map(model => [provider, model] as [AIProviderConfig, ModelInfo])
                      )}
                      onChange={handleEmbeddingModelChange}
                      onClear={handleEmbeddingModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.ModelParameters', { ns: 'agent' })}
                      secondary={t('Preference.ModelParametersDescription', { ns: 'agent' })}
                    />
                    <Button
                      variant='outlined'
                      color='primary'
                      startIcon={<TuneIcon />}
                      onClick={openParametersDialog}
                      disabled={!config}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      {t('Preference.ConfigureModelParameters', { ns: 'agent' })}
                    </Button>
                  </ListItemVertical>
                </>
              )}

              <ProviderConfig
                providers={providers}
                changeDefaultModel={handleModelChange}
                changeDefaultEmbeddingModel={handleEmbeddingModelChange}
                setProviders={setProviders}
              />
            </>
          )}
        </List>
      </Paper>

      {/* 模型参数设置对话框 */}
      <AIModelParametersDialog
        open={parametersDialogOpen}
        onClose={closeParametersDialog}
        config={config}
        onSave={handleConfigChange}
      />
    </>
  );
}
