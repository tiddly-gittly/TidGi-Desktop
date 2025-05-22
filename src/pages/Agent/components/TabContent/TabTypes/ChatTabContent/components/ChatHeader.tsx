import SettingsIcon from '@mui/icons-material/Settings';
import PreviewIcon from '@mui/icons-material/Visibility';
import { Box, CircularProgress, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../../../../store/agentChatStore/index';
import { CompactModelSelector } from './CompactModelSelector';
import { PromptPreviewDialog } from './PromptPreviewDialog';

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
  loading: boolean;
  onOpenParameters: () => void;
  inputText?: string;
}

/**
 * Chat header component with title and AI model controls
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  loading,
  onOpenParameters,
  inputText,
}) => {
  const { t } = useTranslation('agent');
  const { agent, previewDialogOpen, openPreviewDialog, closePreviewDialog } = useAgentChatStore(
    useShallow((state) => ({
      agent: state.agent,
      previewDialogOpen: state.previewDialogOpen,
      openPreviewDialog: state.openPreviewDialog,
      closePreviewDialog: state.closePreviewDialog,
    })),
  );

  return (
    <Header>
      <Title variant='h6'>{title || t('Agent.Untitled', 'Untitled Agent')}</Title>
      <ControlsContainer>
        <IconButton
          size='small'
          onClick={openPreviewDialog}
          title={t('Prompt.Preview', 'Prompt Preview')}
        >
          <PreviewIcon />
        </IconButton>
        {loading && <CircularProgress size={20} sx={{ mr: 1 }} color='primary' />}
        <CompactModelSelector agentDefId={agent?.agentDefId} />
        <IconButton
          size='small'
          onClick={onOpenParameters}
          title={t('Preference.ModelParameters')}
        >
          <SettingsIcon />
        </IconButton>
      </ControlsContainer>
      <PromptPreviewDialog
        open={previewDialogOpen}
        onClose={closePreviewDialog}
        inputText={inputText}
      />
    </Header>
  );
};
