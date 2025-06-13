import ArticleIcon from '@mui/icons-material/Article';
import TuneIcon from '@mui/icons-material/Tune';
import { Box, CircularProgress, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../Agent/store/agentChatStore/index';
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
      <Title variant='h6'>{title || t('Agent.Untitled')}</Title>
      <ControlsContainer>
        <IconButton
          size='small'
          onClick={openPreviewDialog}
          title={t('Prompt.Preview')}
        >
          <ArticleIcon />
        </IconButton>
        {loading && <CircularProgress size={20} sx={{ mr: 1 }} color='primary' />}
        <CompactModelSelector agentDefId={agent?.agentDefId} />
        <IconButton
          size='small'
          onClick={onOpenParameters}
          title={t('Preference.ModelParameters')}
        >
          <TuneIcon />
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
