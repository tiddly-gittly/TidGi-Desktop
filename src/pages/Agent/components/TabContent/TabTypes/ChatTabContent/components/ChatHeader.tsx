// Chat header component with title and model selector

import SettingsIcon from '@mui/icons-material/Settings';
import { Box, CircularProgress, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CompactModelSelector } from './CompactModelSelector';

const Header = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
`;

const Title = styled(Typography)`
  font-weight: 600;
  flex: 1;
`;

const ControlsContainer = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
`;

interface ChatHeaderProps {
  title?: string;
  loading?: boolean;
  agentId?: string;
  agentDefId?: string;
  onOpenParameters: () => void;
}

/**
 * Chat header component with title and AI model controls
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  loading,
  agentId,
  agentDefId,
  onOpenParameters,
}) => {
  const { t } = useTranslation('agent');

  return (
    <Header>
      <Title variant='h6'>{title || t('Agent.Untitled', 'Untitled Agent')}</Title>

      <ControlsContainer>
        {loading && <CircularProgress size={20} sx={{ mr: 1 }} color='primary' />}

        <CompactModelSelector agentId={agentId} agentDefId={agentDefId} />

        <IconButton
          size='small'
          onClick={onOpenParameters}
          title={t('Preference.ModelParameters')}
        >
          <SettingsIcon />
        </IconButton>
      </ControlsContainer>
    </Header>
  );
};
