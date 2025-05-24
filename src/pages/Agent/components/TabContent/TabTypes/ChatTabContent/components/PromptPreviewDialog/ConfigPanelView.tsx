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
import React from 'react';
import { useTranslation } from 'react-i18next';

import { AgentWithoutMessages } from '@/pages/Agent/store/agentChatStore/types';
import { PromptConfigForm } from '../PromptConfigForm';

interface ConfigPanelViewProps {
  agent?: AgentWithoutMessages;
  handlerSchema: Record<string, unknown>;
  handlerConfig?: HandlerConfig;
  handleConfigUpdate: (data: Partial<AgentInstance>) => Promise<void>;
  handleFormChange: (updatedConfig: HandlerConfig) => void;
  handleManualRefresh: () => Promise<void>;
  previewLoading: boolean;
  handlerConfigLoading: boolean;
  autoUpdateEnabled: boolean;
  handleAutoUpdateToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  showSubmitButton?: boolean;
}

/**
 * Configuration panel component with form and controls
 */
export const ConfigPanelView: React.FC<ConfigPanelViewProps> = React.memo(({
  agent,
  handlerSchema,
  handlerConfig,
  handleConfigUpdate,
  handleFormChange,
  handleManualRefresh,
  previewLoading,
  handlerConfigLoading,
  autoUpdateEnabled,
  handleAutoUpdateToggle,
  showSubmitButton = true,
}) => {
  const { t } = useTranslation('agent');

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant='h6' sx={{ fontSize: '1rem' }}>
          {t('Prompt.Configuration')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={t('Prompt.RefreshPreview', 'Manually refresh preview')}>
            <IconButton
              size='small'
              onClick={handleManualRefresh}
              disabled={previewLoading || handlerConfigLoading}
              sx={{ mr: 1 }}
            >
              <RefreshIcon fontSize='small' />
            </IconButton>
          </Tooltip>

          <Tooltip title={t('Prompt.AutoUpdatePreview', 'Auto-update preview on form changes')}>
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
                  <Typography variant='caption'>{t('Prompt.AutoUpdate', 'Auto')}</Typography>
                </Box>
              }
              labelPlacement='start'
              sx={{ mx: 1, my: 0 }}
            />
          </Tooltip>
        </Box>
      </Box>

      {agent && (
        <PromptConfigForm
          schema={handlerSchema || {}}
          formData={handlerConfig || undefined}
          onUpdate={handleConfigUpdate}
          onChange={handleFormChange}
          disabled={previewLoading}
          loading={handlerConfigLoading}
          showSubmitButton={showSubmitButton}
        />
      )}
    </Box>
  );
});
