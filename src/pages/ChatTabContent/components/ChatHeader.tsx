import ArticleIcon from '@mui/icons-material/Article';
import BugReportIcon from '@mui/icons-material/BugReport';
import TuneIcon from '@mui/icons-material/Tune';
import { Box, CircularProgress, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import { usePreferenceObservable } from '@services/preferences/hooks';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../Agent/store/agentChatStore/index';
import { APILogsDialog } from './APILogsDialog';
import ChatTitle from './ChatTitle';
import { CompactModelSelector } from './CompactModelSelector';
import { PromptPreviewDialog } from './PromptPreviewDialog';

const Header = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
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
  const preference = usePreferenceObservable();
  const [apiLogsDialogOpen, setApiLogsDialogOpen] = useState(false);

  const { agent, previewDialogOpen, openPreviewDialog, closePreviewDialog, updateAgent } = useAgentChatStore(
    useShallow((state) => ({
      agent: state.agent,
      previewDialogOpen: state.previewDialogOpen,
      updateAgent: state.updateAgent,
      openPreviewDialog: state.openPreviewDialog,
      closePreviewDialog: state.closePreviewDialog,
    })),
  );

  const handleOpenAPILogs = () => {
    setApiLogsDialogOpen(true);
  };

  const handleCloseAPILogs = () => {
    setApiLogsDialogOpen(false);
  };

  // Show debug button only when debug is enabled and agent exists
  const showDebugButton = preference?.externalAPIDebug && agent?.id;

  return (
    <Header>
      <ChatTitle title={title} agent={agent} updateAgent={updateAgent} />
      <ControlsContainer>
        <IconButton
          size='small'
          onClick={openPreviewDialog}
          title={t('Prompt.Preview')}
        >
          <ArticleIcon />
        </IconButton>
        {showDebugButton && (
          <IconButton
            size='small'
            onClick={handleOpenAPILogs}
            title={t('APILogs.Title')}
          >
            <BugReportIcon />
          </IconButton>
        )}
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
      <APILogsDialog
        open={apiLogsDialogOpen}
        onClose={handleCloseAPILogs}
        agentInstanceId={agent?.id}
      />
    </Header>
  );
};
