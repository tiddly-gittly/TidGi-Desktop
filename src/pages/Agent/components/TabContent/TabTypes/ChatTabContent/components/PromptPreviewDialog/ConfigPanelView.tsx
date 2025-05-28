import AutorenewIcon from '@mui/icons-material/Autorenew';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { AgentInstance } from '@services/agentInstance/interface';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { PromptConfigForm } from '../PromptConfigForm';

interface ConfigPanelViewProps {
  handlerSchema: Record<string, unknown>;
  handlerConfig?: HandlerConfig;
  handleConfigUpdate: (data: Partial<AgentInstance>) => Promise<void>;
  handleFormChange: (updatedConfig: HandlerConfig) => void;
  handleManualRefresh: () => Promise<void>;
  previewLoading: boolean;
  handlerConfigLoading: boolean;
  autoUpdateEnabled: boolean;
  handleAutoUpdateToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Configuration panel component with form and controls
 */
export const ConfigPanelView: React.FC<ConfigPanelViewProps> = React.memo(({
  handlerSchema,
  handlerConfig,
  handleConfigUpdate,
  handleFormChange,
  handleManualRefresh,
  previewLoading,
  handlerConfigLoading,
  autoUpdateEnabled,
  handleAutoUpdateToggle,
}) => {
  const { t } = useTranslation('agent');

  const handleAutoSaveFormChange = useCallback(async (formData: HandlerConfig) => {
    handleFormChange(formData);

    try {
      await handleConfigUpdate({
        handlerConfig: formData,
      });
    } catch (error) {
      console.error('Failed to auto-save handler config:', error);
    }
  }, [handleFormChange, handleConfigUpdate]);

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={t('Prompt.RefreshPreview')}>
            <IconButton
              size='small'
              onClick={handleManualRefresh}
              disabled={previewLoading || handlerConfigLoading}
              sx={{ mr: 1 }}
            >
              <RefreshIcon fontSize='small' />
            </IconButton>
          </Tooltip>

          <Tooltip title={t('Prompt.AutoUpdatePreview')}>
            <FormControlLabel
              control={
                <Switch
                  size='small'
                  checked={autoUpdateEnabled}
                  onChange={handleAutoUpdateToggle}
                  color='primary'
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <AutorenewIcon fontSize='small' sx={{ mr: 0.5 }} />
                  <Typography variant='caption'>{t('Prompt.AutoUpdate')}</Typography>
                </Box>
              }
              labelPlacement='start'
              sx={{ mx: 1, my: 0 }}
            />
          </Tooltip>
        </Box>
      </Box>
      <PromptConfigForm
        schema={handlerSchema}
        formData={handlerConfig}
        onUpdate={handleConfigUpdate}
        onChange={handleAutoSaveFormChange}
        disabled={previewLoading}
        loading={handlerConfigLoading}
      />
    </Box>
  );
});
