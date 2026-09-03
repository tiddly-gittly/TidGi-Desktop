import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import TuneIcon from '@mui/icons-material/Tune';
import { Alert, Button, List } from '@mui/material';

import { ListItemText } from '@/components/ListItem';
import { hasUsableProviderCredentialReference } from '@services/externalAPI/providerCredentials';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import type { IPossibleWindowMeta, IPreferenceWindowMeta } from '@services/windows/WindowProperties';
import type { AgentModelConfig, ModelAssignments, ModelCatalogModel, ModelCatalogProvider, ProviderAccountConfig } from 'memeloop';
import { ListItemVertical, Paper, SectionTitle } from '../../PreferenceComponents';
import { AIModelParametersDialog } from './components/AIModelParametersDialog';
import { ModelSelector } from './components/ModelSelector';
import { ProviderConfig } from './components/ProviderConfig';
import { type AIConfigFailure, useAIConfigManagement } from './useAIConfigManagement';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

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
    error: configError,
    handleFieldClear,
  } = useAIConfigManagement();
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);
  const [catalogProviders, setCatalogProviders] = useState<ModelCatalogProvider[]>([]);
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<AIConfigFailure>();
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
      setCatalogLoadFailed(false);
      try {
        const local = await window.service.externalAPI.getProviderCatalog(false);
        if (active) setCatalogProviders([...local.catalog.providers]);
        const refreshed = await window.service.externalAPI.getProviderCatalog(true);
        if (active) setCatalogProviders([...refreshed.catalog.providers]);
      } catch (error: unknown) {
        if (active) setCatalogLoadFailed(true);
        void window.service.native.log('error', 'Failed to refresh provider catalog', {
          function: 'ExternalAPI.loadCatalog',
          error,
        });
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

  const handleModelClear = () => {
    setActionError(undefined);
    void handleFieldClear('default').catch((error: unknown) => {
      setActionError({ operation: 'clear', error: toError(error) });
    });
  };

  const handleEmbeddingModelClear = () => {
    setActionError(undefined);
    void handleFieldClear('embedding').catch((error: unknown) => {
      setActionError({ operation: 'clear', error: toError(error) });
    });
  };

  const handleSpeechModelClear = () => {
    setActionError(undefined);
    void handleFieldClear('speech').catch((error: unknown) => {
      setActionError({ operation: 'clear', error: toError(error) });
    });
  };

  const handleImageGenerationModelClear = () => {
    setActionError(undefined);
    void handleFieldClear('imageGeneration').catch((error: unknown) => {
      setActionError({ operation: 'clear', error: toError(error) });
    });
  };

  const handleTranscriptionsModelClear = () => {
    setActionError(undefined);
    void handleFieldClear('transcriptions').catch((error: unknown) => {
      setActionError({ operation: 'clear', error: toError(error) });
    });
  };

  // Extract model selections directly from config
  const defaultModelConfig = config?.default;
  const embeddingConfig = config?.embedding;
  const speechConfig = config?.speech;
  const imageGenerationConfig = config?.imageGeneration;
  const transcriptionsConfig = config?.transcriptions;
  const freeModelConfig = config?.free;

  const handleFreeModelClear = () => {
    setActionError(undefined);
    void handleFieldClear('free').catch((error: unknown) => {
      setActionError({ operation: 'clear', error: toError(error) });
    });
  };

  const handleSelection = (handler: (selection: AgentModelConfig) => Promise<void>, selection: AgentModelConfig) => {
    setActionError(undefined);
    void handler(selection).catch((error: unknown) => {
      setActionError({ operation: 'update', error: toError(error) });
    });
  };
  const visibleConfigError = actionError ?? configError;
  const configErrorMessage = visibleConfigError === undefined
    ? undefined
    : t(
      visibleConfigError.operation === 'load'
        ? 'Preference.FailedToLoadAIConfig'
        : visibleConfigError.operation === 'clear'
        ? 'Preference.FailedToClearAIConfig'
        : 'Preference.FailedToUpdateAIConfig',
    );

  return (
    <>
      <SectionTitle ref={props.sectionRef}>{t('Preference.ExternalAPI')}</SectionTitle>
      {configErrorMessage && <Alert severity='error' sx={{ mb: 2 }}>{configErrorMessage}</Alert>}
      {catalogLoadFailed && <Alert severity='error' sx={{ mb: 2 }}>{t('Preference.FailedToLoadProviderCatalog')}</Alert>}
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
                      onChange={selection => {
                        handleSelection(handleModelChange, selection);
                      }}
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
                      onChange={selection => {
                        handleSelection(handleEmbeddingModelChange, selection);
                      }}
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
                      onChange={selection => {
                        handleSelection(handleSpeechModelChange, selection);
                      }}
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
                      onChange={selection => {
                        handleSelection(handleImageGenerationModelChange, selection);
                      }}
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
                      onChange={selection => {
                        handleSelection(handleTranscriptionsModelChange, selection);
                      }}
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
                      onChange={selection => {
                        handleSelection(handleFreeModelChange, selection);
                      }}
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
  return accounts.filter(account => account.enabled !== false && hasUsableProviderCredentialReference(account)).flatMap(account =>
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
