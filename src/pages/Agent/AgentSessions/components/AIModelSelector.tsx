/* eslint-disable @typescript-eslint/no-floating-promises */
import { ModelOption } from '@/pages/Preferences/sections/ExternalAPI/types';
import TuneIcon from '@mui/icons-material/Tune';
import { Autocomplete, Box, Button, TextField } from '@mui/material';
import { AISessionConfig } from '@services/externalAPI/interface';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentStore } from '../store';
import { ModelConfigDialog } from './ModelConfigDialog';

interface AIModelSelectorProps {
  sessionId?: string;
}

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({ sessionId }) => {
  const { t } = useTranslation('agent');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const providers = useAgentStore(state => state.providers);
  const updateSessionAIConfig = useAgentStore(state => state.updateSessionAIConfig);
  const currentConfig = useAgentStore(state => state.getSessionAIConfig(sessionId));

  const config: AISessionConfig = currentConfig || {
    provider: 'siliconflow',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    modelParameters: {
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant.',
    },
  };

  const modelOptions: ModelOption[] = useMemo(() => {
    const options: ModelOption[] = [];
    providers.forEach(provider => {
      if (!provider.enabled) return;
      provider.models.forEach(model => {
        options.push({
          provider: provider.provider,
          model: model.name,
          caption: model.caption || model.name,
          features: model.features || [],
          groupLabel: provider.provider,
        });
      });
    });
    return options;
  }, [providers]);

  const selectedModelOption = useMemo(() => {
    return modelOptions.find(option => option.provider === config.provider && option.model === config.model) || null;
  }, [modelOptions, config.provider, config.model]);

  const handleModelChange = useCallback((option: ModelOption | null) => {
    if (option) {
      updateSessionAIConfig(sessionId, {
        ...config,
        provider: option.provider,
        model: option.model,
      });
    }
  }, [config, sessionId, updateSessionAIConfig]);

  const handleConfigChange = useCallback((newConfig: AISessionConfig) => {
    updateSessionAIConfig(sessionId, newConfig);
  }, [sessionId, updateSessionAIConfig]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Autocomplete
          value={selectedModelOption}
          onChange={(_, value) => {
            handleModelChange(value);
          }}
          options={modelOptions}
          groupBy={(option) => option.provider}
          getOptionLabel={(option) => `${option.caption}`}
          renderInput={(parameters) => (
            <TextField
              {...parameters}
              size='small'
              placeholder={t('Preference.SelectModel')}
              variant='outlined'
            />
          )}
          sx={{ minWidth: 200 }}
        />
        <Button
          variant='outlined'
          size='medium'
          onClick={() => {
            setConfigDialogOpen(true);
          }}
          startIcon={<TuneIcon />}
        >
          {t('Preference.Preferences')}
        </Button>
      </Box>

      <ModelConfigDialog
        open={configDialogOpen}
        onClose={() => {
          setConfigDialogOpen(false);
        }}
        config={config}
        onConfigChange={handleConfigChange}
      />
    </>
  );
};
