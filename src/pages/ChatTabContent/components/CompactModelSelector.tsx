import SwitchCameraIcon from '@mui/icons-material/SwitchCamera';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material';
import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAIConfigManagement } from '../../../windows/Preferences/sections/ExternalAPI/useAIConfigManagement';

// Import from the external component
import { Autocomplete, TextField } from '@mui/material';
import { useAgentChatStore } from '../../Agent/store/agentChatStore';

interface ModelSelectorProps {
  agentDefId?: string;
}

/**
 * Compact model selector with icon and tooltip
 * Uses useAIConfigManagement hook to access and update AI configuration
 */
export const CompactModelSelector: React.FC<ModelSelectorProps> = ({
  agentDefId,
}) => {
  const { t } = useTranslation('agent');
  const [dialogOpen, setDialogOpen] = useState(false);
  const agent = useAgentChatStore((state) => state.agent);

  // Use the AI config management hook with both agent instance ID and definition ID
  const { config, providers = [], handleModelChange } = useAIConfigManagement({
    agentId: agent?.id,
    agentDefId,
  });

  // Convert providers to the format expected by the Autocomplete component
  const modelOptions: Array<[AIProviderConfig, ModelInfo]> = [];

  // Safely process providers to build model options
  for (const provider of providers) {
    if (provider.models) {
      for (const model of provider.models) {
        if ('name' in model) {
          modelOptions.push([provider, model]);
        }
      }
    }
  }

  // Find the currently selected model for the tooltip display
  const currentModel = config?.api
    ? `${config.api.provider} - ${config.api.model}`
    : t('ModelSelector.NoModelSelected');

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
  const selectedModel = config?.api
    ? modelOptions.find(m => m[0].provider === config.api.provider && m[1].name === config.api.model)
    : undefined;

  return (
    <>
      <Tooltip title={currentModel}>
        <IconButton onClick={handleOpenDialog} aria-label={t('ModelSelector.SelectModel')} size='small'>
          <SwitchCameraIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth='sm' fullWidth>
        <DialogTitle>{t('ModelSelector.Title')}</DialogTitle>
        <DialogContent>
          <Autocomplete
            value={selectedModel}
            onChange={(_, newValue) => {
              if (newValue) {
                void handleModelSelect(newValue[0].provider, newValue[1].name);
              }
            }}
            style={{ marginTop: 8 }}
            options={modelOptions}
            getOptionLabel={option => `${option[0].provider} - ${option[1].name}`}
            isOptionEqualToValue={(option, value) => option[0].provider === value[0].provider && option[1].name === value[1].name}
            renderInput={inputParameters => (
              <TextField
                {...inputParameters}
                label={t('ModelSelector.Model')}
                variant='outlined'
                fullWidth
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('Cancel', { ns: 'translation' })}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
