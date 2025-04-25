import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Slider, TextField, Typography } from '@mui/material';
import { AiAPIConfig } from '@services/agent/defaultAgents/schemas';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface ModelConfigDialogProps {
  open: boolean;
  onClose: () => void;
  config: AiAPIConfig;
  onConfigChange: (config: AiAPIConfig) => void;
}

export const ModelConfigDialog: React.FC<ModelConfigDialogProps> = ({
  open,
  onClose,
  config,
  onConfigChange,
}) => {
  const { t } = useTranslation('agent');

  const handleTemperatureChange = useCallback((_event: Event, newValue: number | number[]) => {
    const temperature = newValue as number;
    const updatedConfig = {
      ...config,
      modelParameters: {
        ...config.modelParameters,
        temperature,
      },
    };
    onConfigChange(updatedConfig);
  }, [config, onConfigChange]);

  const handleMaxTokensChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const maxTokens = parseInt(event.target.value, 10) || undefined;
    const updatedConfig = {
      ...config,
      modelParameters: {
        ...config.modelParameters,
        maxTokens,
      },
    };
    onConfigChange(updatedConfig);
  }, [config, onConfigChange]);

  const handleSystemPromptChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const systemPrompt = event.target.value;
    const updatedConfig = {
      ...config,
      modelParameters: {
        ...config.modelParameters,
        systemPrompt,
      },
    };
    onConfigChange(updatedConfig);
  }, [config, onConfigChange]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>{t('AI.ModelSettings')}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant='subtitle2' gutterBottom>
            {t('AI.Temperature')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Slider
              value={config.modelParameters.temperature ?? 0.7}
              min={0}
              max={1}
              step={0.1}
              onChange={handleTemperatureChange}
              valueLabelDisplay='auto'
              sx={{ flex: 1, mr: 2 }}
            />
            <Typography variant='body2'>
              {(config.modelParameters.temperature ?? 0.7).toFixed(1)}
            </Typography>
          </Box>
          <Typography variant='caption' color='text.secondary'>
            {t('AI.TemperatureHelp')}
          </Typography>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant='subtitle2' gutterBottom>
            {t('AI.MaxTokens')}
          </Typography>
          <TextField
            value={config.modelParameters.maxTokens ?? ''}
            onChange={handleMaxTokensChange}
            type='number'
            fullWidth
            variant='outlined'
            size='small'
            placeholder='2048'
          />
          <Typography variant='caption' color='text.secondary'>
            {t('AI.MaxTokensHelp')}
          </Typography>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant='subtitle2' gutterBottom>
            {t('AI.SystemPrompt')}
          </Typography>
          <TextField
            value={config.modelParameters.systemPrompt ?? ''}
            onChange={handleSystemPromptChange}
            fullWidth
            multiline
            rows={4}
            variant='outlined'
            placeholder={t('AI.SystemPromptPlaceholder')}
          />
          <Typography variant='caption' color='text.secondary'>
            {t('AI.SystemPromptHelp')}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='primary'>
          {t('Close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
