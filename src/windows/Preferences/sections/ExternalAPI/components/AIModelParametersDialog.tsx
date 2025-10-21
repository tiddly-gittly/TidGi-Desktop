import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, InputAdornment, Slider, TextField } from '@mui/material';
import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { ModelParameters } from '@services/agentInstance/promptConcat/promptConcatSchema/modelParameters';
import { cloneDeep } from 'lodash';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Props for the AIModelParametersDialog component
 */
interface AIModelParametersDialogProps {
  open: boolean;
  onClose: () => void;
  config: AiAPIConfig | null;
  onSave: (newConfig: AiAPIConfig) => Promise<void>;
}

/**
 * Dialog component for editing AI model parameters
 * Used across the application for configuring model settings
 */
export function AIModelParametersDialog({ open, onClose, config, onSave }: AIModelParametersDialogProps) {
  const { t } = useTranslation(['translation', 'agent']);
  const [parameters, setParameters] = useState<ModelParameters>({
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.95,
    systemPrompt: '',
  });

  // Update local state when config changes
  useEffect(() => {
    if (config?.modelParameters) {
      setParameters({
        temperature: config.modelParameters.temperature ?? 0.7,
        maxTokens: config.modelParameters.maxTokens ?? 1000,
        topP: config.modelParameters.topP ?? 0.95,
        systemPrompt: config.modelParameters.systemPrompt ?? '',
      });
    }
  }, [config]);

  // Handle save action
  const handleSave = async () => {
    if (!config) return;

    try {
      // Create a deep copy of the config to avoid mutating the original
      const newConfig = cloneDeep(config);
      newConfig.modelParameters = parameters;
      await onSave(newConfig);
      onClose();
    } catch (error) {
      void window.service.native.log('error', 'Failed to save model parameters', { function: 'AIModelParametersDialog.handleSave', error });
    }
  };

  // Temperature slider handler
  const handleTemperatureChange = (_event: Event, value: number | number[]) => {
    setParameters((previous) => ({
      ...previous,
      temperature: typeof value === 'number' ? value : value[0],
    }));
  };

  // Top-P slider handler
  const handleTopPChange = (_event: Event, value: number | number[]) => {
    setParameters((previous) => ({
      ...previous,
      topP: typeof value === 'number' ? value : value[0],
    }));
  };

  // Max tokens handler
  const handleMaxTokensChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value)) {
      setParameters((previous) => ({
        ...previous,
        maxTokens: value,
      }));
    }
  };

  // System prompt handler
  const handleSystemPromptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setParameters((previous) => ({
      ...previous,
      systemPrompt: event.target.value,
    }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{t('Preference.ModelParameters', { defaultValue: 'Model Parameters', ns: 'agent' })}</DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mt: 2 }}>
          <FormHelperText>
            {t('Preference.Temperature', { defaultValue: 'Temperature', ns: 'agent' })}: {parameters.temperature?.toFixed(2)}
          </FormHelperText>
          <Slider
            value={parameters.temperature}
            onChange={handleTemperatureChange}
            min={0}
            max={1}
            step={0.01}
            aria-labelledby='temperature-slider'
            valueLabelDisplay='auto'
          />
          <FormHelperText>
            {t('Preference.TemperatureDescription', {
              defaultValue: 'Higher values produce more creative and varied results, lower values are more deterministic.',
              ns: 'agent',
            })}
          </FormHelperText>
        </FormControl>

        <FormControl fullWidth sx={{ mt: 3 }}>
          <FormHelperText>
            {t('Preference.TopP', { defaultValue: 'Top P', ns: 'agent' })}: {parameters.topP?.toFixed(2)}
          </FormHelperText>
          <Slider
            value={parameters.topP}
            onChange={handleTopPChange}
            min={0}
            max={1}
            step={0.01}
            aria-labelledby='top-p-slider'
            valueLabelDisplay='auto'
          />
          <FormHelperText>
            {t('Preference.TopPDescription', {
              defaultValue: 'Controls diversity. Lower values make text more focused, higher values more diverse.',
              ns: 'agent',
            })}
          </FormHelperText>
        </FormControl>

        <FormControl fullWidth sx={{ mt: 3 }}>
          <TextField
            label={t('Preference.MaxTokens', { defaultValue: 'Max Tokens', ns: 'agent' })}
            value={parameters.maxTokens}
            onChange={handleMaxTokensChange}
            type='number'
            slotProps={{
              input: {
                endAdornment: <InputAdornment position='end'>tokens</InputAdornment>,
              },
            }}
            helperText={t('Preference.MaxTokensDescription', {
              defaultValue: 'Maximum number of tokens to generate. 1000 tokens is about 750 words.',
              ns: 'agent',
            })}
          />
        </FormControl>

        <FormControl fullWidth sx={{ mt: 3 }}>
          <TextField
            label={t('Preference.SystemPrompt', { defaultValue: 'System Prompt', ns: 'agent' })}
            value={parameters.systemPrompt}
            onChange={handleSystemPromptChange}
            multiline
            rows={4}
            placeholder={t('Preference.SystemPromptPlaceholder', {
              defaultValue: 'Optional: Provide system instructions to guide the AI',
              ns: 'agent',
            })}
            helperText={t('Preference.SystemPromptDescription', {
              defaultValue: 'System instructions that define how the AI should behave (optional)',
              ns: 'agent',
            })}
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
