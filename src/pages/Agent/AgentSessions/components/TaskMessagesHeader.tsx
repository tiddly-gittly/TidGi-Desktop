import TuneIcon from '@mui/icons-material/Tune';
import { Box, Button } from '@mui/material';
import { AIProviderConfig, ModelInfo } from '@services/externalAPI/interface';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { ModelSelector } from '../../../Preferences/sections/ExternalAPI/components/ModelSelector';
import { ModelConfigDialog } from './ModelConfigDialog';
import { useTaskConfigManagement } from './useAIConfigManagement';

const Header = styled.div`
  padding: 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.2rem;
  color: ${props => props.theme.palette.text.primary};
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

interface TaskMessagesHeaderProps {
  title: string;
  taskId?: string;
}

export const TaskMessagesHeader: React.FC<TaskMessagesHeaderProps> = ({ title, taskId }) => {
  const { t } = useTranslation('agent');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const { loading, config, providers, handleModelChange, handleConfigChange } = useTaskConfigManagement({ taskId });

  if (loading || !config) {
    return (
      <Header>
        <HeaderContent>
          <Title>{title}</Title>
        </HeaderContent>
        <div>{t('Loading')}</div>
      </Header>
    );
  }

  return (
    <Header>
      <HeaderContent>
        <Title>{title}</Title>
      </HeaderContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size='large'
          onClick={() => {
            setConfigDialogOpen(true);
          }}
        >
          <TuneIcon />
        </Button>
        <ModelSelector
          selectedConfig={config}
          modelOptions={providers.flatMap(provider => provider.models.map(model => [provider, model] as [AIProviderConfig, ModelInfo]))}
          onChange={handleModelChange}
          onlyShowEnabled
        />
      </Box>
      <ModelConfigDialog
        open={configDialogOpen}
        onClose={() => {
          setConfigDialogOpen(false);
        }}
        config={config}
        onConfigChange={handleConfigChange}
      />
    </Header>
  );
};
