import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import BugReportIcon from '@mui/icons-material/BugReport';
import TuneIcon from '@mui/icons-material/Tune';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { usePreferenceObservable } from '@services/preferences/hooks';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { AgentSwitcher } from './AgentSwitcher';
import { APILogsDialog } from './APILogsDialog';
import { CompactModelSelector } from './CompactModelSelector';
import { PromptPreviewButtonWithMenu } from './PromptPreviewButtonWithMenu';

const Toolbar = styled(Box, { shouldForwardProp: (property) => property !== 'embedded' })<{ embedded?: boolean }>(({ theme, embedded }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  ...(embedded
    ? { flex: 1, minWidth: 0 }
    : {
      padding: '8px 16px',
      borderTop: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper,
    }),
}));

const LeftControls = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`;

const RightControls = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
`;

interface ChatToolbarProps {
  tabId: string;
  currentAgentDefId?: string;
  onSwitchAgent?: (agentDefinitionId: string) => void;
  onOpenParameters: () => void;
  loading?: boolean;
  isStreaming?: boolean;
  isSplitView?: boolean;
  /** When true, render as a transparent inline strip for placement inside the composer row. */
  embedded?: boolean;
}

/**
 * Bottom toolbar for the chat tab.
 * Holds controls that are not part of the shared "conversation list/current" header:
 * agent switcher, prompt preview menu, model selector, model parameters, and debug logs.
 */
export const ChatToolbar: React.FC<ChatToolbarProps> = ({
  tabId,
  currentAgentDefId,
  onSwitchAgent,
  onOpenParameters,
  loading,
  isStreaming,
  isSplitView,
  embedded,
}) => {
  const { t } = useTranslation('agent');
  const preference = usePreferenceObservable();
  const [apiLogsDialogOpen, setApiLogsDialogOpen] = useState(false);

  const { agent } = useAgentChatStore(useShallow((state) => ({ agent: state.agent })));
  const showDebugButton = preference?.externalAPIDebug && agent?.id;

  return (
    <>
      <Toolbar embedded={embedded}>
        <LeftControls>
          {onSwitchAgent && (
            <AgentSwitcher
              currentAgentDefId={currentAgentDefId}
              onSwitch={onSwitchAgent}
              disabled={loading || isStreaming}
            />
          )}
        </LeftControls>
        <RightControls>
          <PromptPreviewButtonWithMenu
            tabId={tabId}
            isSplitView={isSplitView}
            agentDefId={currentAgentDefId}
            disabled={loading || isStreaming}
          />
          {showDebugButton && (
            <Tooltip title={t('APILogs.Title')} disableInteractive>
              <IconButton
                size='small'
                onClick={() => {
                  setApiLogsDialogOpen(true);
                }}
              >
                <BugReportIcon />
              </IconButton>
            </Tooltip>
          )}
          {isStreaming && agent?.status?.progress
            ? (
              <Tooltip title={agent.status.progress} disableInteractive>
                <Typography variant='caption' color='text.secondary' sx={{ whiteSpace: 'nowrap' }}>
                  {agent.status.progress}
                </Typography>
              </Tooltip>
            )
            : loading
            ? <CircularProgress size={20} color='primary' />
            : null}
          <CompactModelSelector agentDefId={currentAgentDefId} />
          <Tooltip title={t('Preference.ModelParameters')} disableInteractive>
            <IconButton size='small' onClick={onOpenParameters}>
              <TuneIcon />
            </IconButton>
          </Tooltip>
        </RightControls>
      </Toolbar>
      <APILogsDialog
        open={apiLogsDialogOpen}
        onClose={() => {
          setApiLogsDialogOpen(false);
        }}
        agentInstanceId={agent?.id}
      />
    </>
  );
};
