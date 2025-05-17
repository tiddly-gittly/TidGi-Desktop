// Model selector with icon and tooltip

import TuneIcon from '@mui/icons-material/Tune';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material';
import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAIConfigManagement } from '../../../../../../../pages/Preferences/sections/ExternalAPI/useAIConfigManagement';

// Import from the external component
import { Autocomplete, TextField } from '@mui/material';

interface ModelSelectorProps {
  agentId?: string;
  agentDefId?: string;
}

/**
 * Compact model selector with icon and tooltip
 * Uses useAIConfigManagement hook to access and update AI configuration
 */
export const CompactModelSelector: React.FC<ModelSelectorProps> = ({
  agentId,
  agentDefId,
}) => {
  const { t } = useTranslation('agent');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Use the AI config management hook with both agent instance ID and definition ID
  const { config, providers, handleModelChange } = useAIConfigManagement({
    agentId,
    agentDefId,
  });

  // Convert providers to the format expected by the Autocomplete component
  const modelOptions: Array<[AIProviderConfig, ModelInfo]> = [];

  // Safely process providers to build model options
  providers.forEach((provider: AIProviderConfig) => {
    if (provider.enabled && provider.models) {
      provider.models.forEach((model: ModelInfo) => {
        if (model && typeof model === 'object' && 'name' in model) {
          modelOptions.push([provider, model]);
        }
      });
    }
  });

  // Find the currently selected model for the tooltip display
  const currentModel = config?.api
    ? `${config.api.provider} - ${config.api.model}`
    : '-';

  // Filter enabled providers
  const filteredModelOptions = modelOptions.filter(m => m[0] && m[0].enabled);

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  const handleModelSelect = async (provider: string, model: string) => {
    await handleModelChange(provider, model);
    setDialogOpen(false);
  };

  // Find currently selected model in options
  const selectedValue = config?.api
    ? modelOptions.find(m =>
      m[0] && m[0].provider === config.api.provider &&
      m[1] && m[1].name === config.api.model
    ) || null
    : null;

  return (
    <>
      <Tooltip title={`${t('Preference.EnableProvider')}: ${currentModel}`} arrow>
        <IconButton
          size='small'
          onClick={handleOpenDialog}
          color='primary'
        >
          <TuneIcon />
        </IconButton>
      </Tooltip>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{t('Preference.DefaultAIModelSelection')}</DialogTitle>
        <DialogContent>
          <Autocomplete
            value={selectedValue}
            onChange={(_, value) => {
              if (value) {
                void handleModelSelect(value[0].provider, value[1].name);
              }
            }}
            options={filteredModelOptions}
            groupBy={(option) => option[0].provider}
            getOptionLabel={(option) => option[1].name}
            renderInput={(parameters) => (
              <TextField
                {...parameters}
                label={t('Preference.SelectModel')}
                variant='outlined'
                fullWidth
              />
            )}
            fullWidth
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('Preference.Cancel')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
