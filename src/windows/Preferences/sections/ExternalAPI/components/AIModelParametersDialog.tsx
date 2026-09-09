import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, InputAdornment, Slider, TextField, Typography } from '@mui/material';
import type { AgentModelParameters, ModelAssignments } from 'memeloop';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Props for the AIModelParametersDialog component
 */
interface AIModelParametersDialogProps {
  open: boolean;
  onClose: () => void;
  config: ModelAssignments | null;
  onSave: (newConfig: ModelAssignments) => Promise<void>;
}

/**
 * Dialog component for editing AI model parameters
 * Used across the application for configuring model settings
 */
export function AIModelParametersDialog({ open, onClose, config, onSave }: AIModelParametersDialogProps) {
  const { t } = useTranslation(['translation', 'agent']);
  const [parameters, setParameters] = useState<AgentModelParameters>({
    temperature: 0.7,
    maxOutputTokens: 1000,
    topP: 0.95,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Update local state when config changes
  useEffect(() => {
    if (!open) {
      setSaveError(false);
      setSaving(false);
    }
    if (config?.default) {
      setParameters({
        temperature: config.default.parameters?.temperature ?? 0.7,
        maxOutputTokens: config.default.parameters?.maxOutputTokens ?? 1000,
        topP: config.default.parameters?.topP ?? 0.95,
        ...(config.default.parameters?.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: config.default.parameters.reasoningEffort }),
      });
    }
  }, [config, open]);

  // Handle save action
  const handleSave = async () => {
    if (!config?.default) {
      setSaveError(true);
      return;
    }

    setSaveError(false);
    setSaving(true);
    try {
      const newConfig: ModelAssignments = {
        ...config,
        default: {
          ...config.default,
          parameters,
        },
      };
      await onSave(newConfig);
      onClose();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
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
        maxOutputTokens: value,
      }));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{t('Preference.ModelParameters', { ns: 'agent' })}</DialogTitle>
      <DialogContent>
        {saveError && <Alert severity='error' sx={{ mb: 2 }}>{t('Preference.FailedToSaveModelParameters', { ns: 'agent' })}</Alert>}
        {config?.default && (
          <Typography variant='subtitle2' color='text.secondary' sx={{ mb: 2 }}>
            {config.default.providerId} - {config.default.modelId}
          </Typography>
        )}
        <FormControl fullWidth sx={{ mt: 2 }}>
          <FormHelperText>
            {t('Preference.Temperature', { ns: 'agent' })}: {parameters.temperature?.toFixed(2)}
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
            {t('Preference.TemperatureDescription', { ns: 'agent' })}
          </FormHelperText>
        </FormControl>

        <FormControl fullWidth sx={{ mt: 3 }}>
          <FormHelperText>
            {t('Preference.TopP', { ns: 'agent' })}: {parameters.topP?.toFixed(2)}
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
            {t('Preference.TopPDescription', { ns: 'agent' })}
          </FormHelperText>
        </FormControl>

        <FormControl fullWidth sx={{ mt: 3 }}>
          <TextField
            label={t('Preference.MaxTokens', { ns: 'agent' })}
            value={parameters.maxOutputTokens}
            onChange={handleMaxTokensChange}
            type='number'
            slotProps={{
              input: {
                endAdornment: <InputAdornment position='end'>{t('Preference.TokensUnit', { ns: 'agent' })}</InputAdornment>,
              },
            }}
            helperText={t('Preference.MaxTokensDescription', { ns: 'agent' })}
          />
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('Cancel')}</Button>
        <Button
          onClick={() => {
            void handleSave();
          }}
          variant='contained'
          color='primary'
          disabled={saving || !config?.default}
        >
          {t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
