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
  const {
    loading,
    config,
    providers,
    setProviders,
    handleModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
    handleFreeModelChange,
    handleConfigChange,
  } = useAIConfigManagement();
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
      // Delete the default model configuration
      await window.service.externalAPI.deleteFieldFromDefaultAIConfig('default');

      // Update local state to reflect deletion
      const updatedConfig = {
        ...config,
        default: undefined,
      };

      await handleConfigChange(updatedConfig);
    } catch (error) {
      console.error('Failed to clear model configuration:', error);
    }
  };

  const handleEmbeddingModelClear = async () => {
    if (!config) return;

    // Delete the embedding model configuration
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('embedding');

    // Update local state to reflect the change
    const updatedConfig = {
      ...config,
      embedding: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  const handleSpeechModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('speech');

    const updatedConfig = {
      ...config,
      speech: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  const handleImageGenerationModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('imageGeneration');

    const updatedConfig = {
      ...config,
      imageGeneration: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  const handleTranscriptionsModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('transcriptions');

    const updatedConfig = {
      ...config,
      transcriptions: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  // Extract model selections directly from config
  const defaultModelConfig = config?.default;
  const embeddingConfig = config?.embedding;
  const speechConfig = config?.speech;
  const imageGenerationConfig = config?.imageGeneration;
  const transcriptionsConfig = config?.transcriptions;
  const freeModelConfig = config?.free;

  const handleFreeModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('free');

    const updatedConfig = {
      ...config,
      free: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

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
                      selectedModel={defaultModelConfig}
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
                      selectedModel={embeddingConfig}
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
                      primary={t('Preference.DefaultSpeechModelSelection')}
                      secondary={t('Preference.DefaultSpeechModelSelectionDescription')}
                    />
                    <ModelSelector
                      selectedModel={speechConfig}
                      modelOptions={providers.flatMap(provider =>
                        provider.models
                          .filter(model => Array.isArray(model.features) && model.features.includes('speech'))
                          .map(model => [provider, model] as [AIProviderConfig, ModelInfo])
                      )}
                      onChange={handleSpeechModelChange}
                      onClear={handleSpeechModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.DefaultImageGenerationModelSelection')}
                      secondary={t('Preference.DefaultImageGenerationModelSelectionDescription')}
                    />
                    <ModelSelector
                      selectedModel={imageGenerationConfig}
                      modelOptions={providers.flatMap(provider =>
                        provider.models
                          .filter(model => Array.isArray(model.features) && model.features.includes('imageGeneration'))
                          .map(model => [provider, model] as [AIProviderConfig, ModelInfo])
                      )}
                      onChange={handleImageGenerationModelChange}
                      onClear={handleImageGenerationModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.DefaultTranscriptionsModelSelection')}
                      secondary={t('Preference.DefaultTranscriptionsModelSelectionDescription')}
                    />
                    <ModelSelector
                      selectedModel={transcriptionsConfig}
                      modelOptions={providers.flatMap(provider =>
                        provider.models
                          .filter(model => Array.isArray(model.features) && model.features.includes('transcriptions'))
                          .map(model => [provider, model] as [AIProviderConfig, ModelInfo])
                      )}
                      onChange={handleTranscriptionsModelChange}
                      onClear={handleTranscriptionsModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.DefaultFreeModelSelection')}
                      secondary={t('Preference.DefaultFreeModelSelectionDescription')}
                    />
                    <ModelSelector
                      selectedModel={freeModelConfig}
                      modelOptions={providers.flatMap(provider =>
                        provider.models
                          .filter(model => Array.isArray(model.features) && model.features.includes('free'))
                          .map(model => [provider, model] as [AIProviderConfig, ModelInfo])
                      )}
                      onChange={handleFreeModelChange}
                      onClear={handleFreeModelClear}
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
                changeDefaultSpeechModel={handleSpeechModelChange}
                changeDefaultImageGenerationModel={handleImageGenerationModelChange}
                changeDefaultTranscriptionsModel={handleTranscriptionsModelChange}
                changeDefaultFreeModel={handleFreeModelChange}
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
