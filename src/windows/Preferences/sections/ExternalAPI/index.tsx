import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import TuneIcon from '@mui/icons-material/Tune';
import { Button, List } from '@mui/material';

import { ListItemText } from '@/components/ListItem';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import type { IPossibleWindowMeta, IPreferenceWindowMeta } from '@services/windows/WindowProperties';
import type { ModelAssignments, ModelCatalogModel, ModelCatalogProvider, ProviderAccountConfig } from 'memeloop';
import { ListItemVertical, Paper, SectionTitle } from '../../PreferenceComponents';
import { AIModelParametersDialog } from './components/AIModelParametersDialog';
import { ModelSelector } from './components/ModelSelector';
import { ProviderConfig } from './components/ProviderConfig';
import { useAIConfigManagement } from './useAIConfigManagement';

export function ExternalAPI(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation('agent');
  const {
    loading,
    config,
    accounts,
    setAccounts,
    handleModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
    handleFreeModelChange,
    handleConfigChange,
  } = useAIConfigManagement();
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);
  const [catalogProviders, setCatalogProviders] = useState<ModelCatalogProvider[]>([]);
  const [focusTarget, setFocusTarget] = useState(
    () => (window.meta() as IPossibleWindowMeta<IPreferenceWindowMeta>).preferenceFocus,
  );

  useEffect(() => {
    const handleWindowMetaUpdated = (_event: Electron.IpcRendererEvent, meta: IPossibleWindowMeta<IPreferenceWindowMeta>) => {
      if (meta.preferenceFocus) setFocusTarget(meta.preferenceFocus);
    };
    window.remote.registerWindowMetaUpdated(handleWindowMetaUpdated);
    return () => {
      window.remote.unregisterWindowMetaUpdated(handleWindowMetaUpdated);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      try {
        const local = await window.service.externalAPI.getProviderCatalog(false);
        if (active) setCatalogProviders([...local.catalog.providers]);
        const refreshed = await window.service.externalAPI.getProviderCatalog(true);
        if (active) setCatalogProviders([...refreshed.catalog.providers]);
      } catch (error: unknown) {
        console.error('Failed to refresh provider catalog:', error);
      }
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

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
      <SectionTitle ref={props.sectionRef}>{t('Preference.ExternalAPI')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {loading ? <ListItemVertical>{t('Loading')}</ListItemVertical> : (
            <>
              {accounts.length > 0 && (
                <>
                  <ListItemVertical>
                    <ListItemText
                      primary={t('Preference.DefaultAIModelSelection')}
                      secondary={t('Preference.DefaultAIModelSelectionDescription')}
                    />
                    <ModelSelector
                      selectedModel={defaultModelConfig}
                      modelOptions={modelOptionsForAssignment(accounts, 'default')}
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
                      modelOptions={modelOptionsForAssignment(accounts, 'embedding')}
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
                      modelOptions={modelOptionsForAssignment(accounts, 'speech')}
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
                      modelOptions={modelOptionsForAssignment(accounts, 'imageGeneration')}
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
                      modelOptions={modelOptionsForAssignment(accounts, 'transcriptions')}
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
                      modelOptions={modelOptionsForAssignment(accounts, 'free')}
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
                accounts={accounts}
                catalogProviders={catalogProviders}
                setAccounts={setAccounts}
                focusTarget={focusTarget}
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

function modelOptionsForAssignment(
  accounts: readonly ProviderAccountConfig[],
  assignment: keyof ModelAssignments,
) {
  return accounts.flatMap(account =>
    account.models.flatMap(route => {
      const model = account.catalogProvider?.models.find(candidate => candidate.id === route.modelId || candidate.id === route.wireModelId);
      return supportsAssignment(model, assignment) ? [[account, route, model] as const] : [];
    })
  );
}

function supportsAssignment(
  model: ModelCatalogModel | undefined,
  assignment: keyof ModelAssignments,
): boolean {
  if (model === undefined) return assignment === 'default' || assignment === 'free';
  const inputs = new Set(model.modalities?.input ?? []);
  const outputs = new Set(model.modalities?.output ?? []);
  switch (assignment) {
    case 'default':
    case 'free':
      return inputs.has('text') && outputs.has('text');
    case 'embedding':
      return /embed/i.test(model.id) || /embed/i.test(model.name);
    case 'speech':
      return outputs.has('audio');
    case 'imageGeneration':
      return outputs.has('image');
    case 'transcriptions':
      return inputs.has('audio') && outputs.has('text');
  }
}
