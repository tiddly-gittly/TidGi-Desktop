import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import TuneIcon from '@mui/icons-material/Tune';
import { Button, List } from '@mui/material';

import { ListItemText } from '@/components/ListItem';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { AIProviderConfig, ModelInfo } from '@services/providerRegistry/interface';
import { ListItemVertical, Paper, SectionTitle } from '../PreferenceComponents';
import { AIModelParametersDialog } from './ExternalAPI/components/AIModelParametersDialog';
import { ModelSelector } from './ExternalAPI/components/ModelSelector';
import { useAIConfigManagement } from './ExternalAPI/useAIConfigManagement';

export function AIModels(props: ICustomSectionProps): React.JSX.Element {
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
      await window.service.externalAPI.deleteFieldFromDefaultAIConfig('default');
      await handleConfigChange({ ...config, default: undefined });
    } catch (error) {
      console.error('Failed to clear model configuration:', error);
    }
  };

  const handleEmbeddingModelClear = async () => {
    if (!config) return;
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('embedding');
    await handleConfigChange({ ...config, embedding: undefined });
  };

  const handleSpeechModelClear = async () => {
    if (!config) return;
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('speech');
    await handleConfigChange({ ...config, speech: undefined });
  };

  const handleImageGenerationModelClear = async () => {
    if (!config) return;
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('imageGeneration');
    await handleConfigChange({ ...config, imageGeneration: undefined });
  };

  const handleTranscriptionsModelClear = async () => {
    if (!config) return;
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('transcriptions');
    await handleConfigChange({ ...config, transcriptions: undefined });
  };

  const handleFreeModelClear = async () => {
    if (!config) return;
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig('free');
    await handleConfigChange({ ...config, free: undefined });
  };

  const defaultModelConfig = config?.default;
  const embeddingConfig = config?.embedding;
  const speechConfig = config?.speech;
  const imageGenerationConfig = config?.imageGeneration;
  const transcriptionsConfig = config?.transcriptions;
  const freeModelConfig = config?.free;

  return (
    <>
      <SectionTitle ref={props.sectionRef}>
        {t('Preference.AIModels')}
      </SectionTitle>
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
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter((model) => Array.isArray(model.features) && model.features.includes('language'))
                          .map((model) => [provider, model] as [AIProviderConfig, ModelInfo])
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
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter((model) => Array.isArray(model.features) && model.features.includes('embedding'))
                          .map((model) => [provider, model] as [AIProviderConfig, ModelInfo])
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
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter((model) => Array.isArray(model.features) && model.features.includes('speech'))
                          .map((model) => [provider, model] as [AIProviderConfig, ModelInfo])
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
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter((model) => Array.isArray(model.features) && model.features.includes('imageGeneration'))
                          .map((model) => [provider, model] as [AIProviderConfig, ModelInfo])
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
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter((model) => Array.isArray(model.features) && model.features.includes('transcriptions'))
                          .map((model) => [provider, model] as [AIProviderConfig, ModelInfo])
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
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter((model) => Array.isArray(model.features) && model.features.includes('free'))
                          .map((model) => [provider, model] as [AIProviderConfig, ModelInfo])
                      )}
                      onChange={handleFreeModelChange}
                      onClear={handleFreeModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.ModelParameters')}
                      secondary={t('Preference.ModelParametersDescription')}
                    />
                    <Button
                      variant='outlined'
                      startIcon={<TuneIcon />}
                      onClick={openParametersDialog}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      {t('Preference.ConfigureModelParameters')}
                    </Button>
                    <AIModelParametersDialog
                      open={parametersDialogOpen}
                      onClose={closeParametersDialog}
                      parameters={config?.modelParameters || {}}
                      onChange={async (newParameters) => {
                        if (config) {
                          await handleConfigChange({
                            ...config,
                            modelParameters: newParameters,
                          });
                        }
                      }}
                    />
                  </ListItemVertical>
                </>
              )}
            </>
          )}
        </List>
      </Paper>
    </>
  );
}