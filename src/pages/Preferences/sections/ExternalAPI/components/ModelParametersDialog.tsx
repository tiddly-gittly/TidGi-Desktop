import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, InputAdornment, Slider, TextField } from '@mui/material';
import { AiAPIConfig } from '@services/agentInstance/buildInAgentHandlers/promptConcatUtils/promptConcatSchema';
import { ModelParameters } from '@services/agentInstance/buildInAgentHandlers/promptConcatUtils/promptConcatSchema/modelParameters';
import { cloneDeep } from 'lodash';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ModelParametersDialogProps {
  open: boolean;
  onClose: () => void;
  config: AiAPIConfig | null;
  onSave: (newConfig: AiAPIConfig) => Promise<void>;
}

export function ModelParametersDialog({ open, onClose, config, onSave }: ModelParametersDialogProps) {
  const { t } = useTranslation(['translation', 'agent']);
  const [parameters, setParameters] = useState<ModelParameters>({
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.95,
    systemPrompt: '',
  });

  // Update local state when config changes
  useEffect(() => {
    if (config && config.modelParameters) {
      setParameters({
        temperature: config.modelParameters.temperature ?? 0.7,
        maxTokens: config.modelParameters.maxTokens ?? 1000,
        topP: config.modelParameters.topP ?? 0.95,
        systemPrompt: config.modelParameters.systemPrompt ?? '',
      });
    }
  }, [config]);

  const handleChange = (field: keyof ModelParameters, value: number | string) => {
    setParameters(previous => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      const updatedConfig = cloneDeep(config);
      updatedConfig.modelParameters = parameters;
      await onSave(updatedConfig);
      onClose();
    } catch (error) {
      console.error('Failed to save model parameters:', error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{t('Preference.ModelParameters', { ns: 'agent' })}</DialogTitle>
      <DialogContent>
        {/* Temperature */}
        <FormControl fullWidth margin='normal'>
          <FormHelperText>
            {t('Preference.Temperature', { ns: 'agent' })}
            {`: ${(parameters.temperature ?? 0.7).toFixed(2)}`}
          </FormHelperText>
          <Slider
            value={parameters.temperature ?? 0.7}
            min={0}
            max={1}
            step={0.01}
            onChange={(_, value) => {
              handleChange('temperature', value as number);
            }}
            aria-labelledby='temperature-slider'
            valueLabelDisplay='auto'
          />
          <FormHelperText>
            {t('Preference.TemperatureDescription', { ns: 'agent' })}
          </FormHelperText>
        </FormControl>

        {/* Max Tokens */}
        <FormControl fullWidth margin='normal'>
          <TextField
            label={t('Preference.MaxTokens', { ns: 'agent' })}
            type='number'
            value={parameters.maxTokens ?? 1000}
            onChange={(event) => {
              handleChange('maxTokens', Number(event.target.value));
            }}
            slotProps={{
              input: {
                endAdornment: <InputAdornment position='end'>tokens</InputAdornment>,
              },
            }}
            helperText={t('Preference.MaxTokensDescription', { ns: 'agent' })}
          />
        </FormControl>

        {/* Top P */}
        <FormControl fullWidth margin='normal'>
          <FormHelperText>
            {t('Preference.TopP', { ns: 'agent' })}
            {`: ${(parameters.topP ?? 0.95).toFixed(2)}`}
          </FormHelperText>
          <Slider
            value={parameters.topP ?? 0.95}
            min={0}
            max={1}
            step={0.01}
            onChange={(_, value) => {
              handleChange('topP', value as number);
            }}
            aria-labelledby='top-p-slider'
            valueLabelDisplay='auto'
          />
          <FormHelperText>
            {t('Preference.TopPDescription', { ns: 'agent' })}
          </FormHelperText>
        </FormControl>

        {/* System Prompt */}
        <FormControl fullWidth margin='normal'>
          <TextField
            label={t('Preference.SystemPrompt', { ns: 'agent' })}
            value={parameters.systemPrompt ?? ''}
            onChange={(event) => {
              handleChange('systemPrompt', event.target.value);
            }}
            multiline
            rows={4}
            helperText={t('Preference.SystemPromptDescription', { ns: 'agent' })}
          />
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button onClick={handleSave} variant='contained' color='primary'>
          {t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
