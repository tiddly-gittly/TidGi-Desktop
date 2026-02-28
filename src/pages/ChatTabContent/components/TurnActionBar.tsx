/**
 * Turn Action Bar — VSCode-style action icons shown at the bottom of each agent turn.
 *
 * Actions:
 * - Rollback: restore wiki files to state before this turn (shown when files were changed)
 * - Retry: re-send user message, delete current agent responses
 * - Delete: remove entire turn, return user message to input
 * - Copy: copy this turn's agent text to clipboard
 * - Copy All: copy the full conversation to clipboard
 */
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CopyAllIcon from '@mui/icons-material/CopyAll';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import RestoreIcon from '@mui/icons-material/Restore';
import { Box, Chip, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { useAgentChatStore } from '../../Agent/store/agentChatStore/index';
import { stripToolXml } from './MessageRenderer/BaseMessageRenderer';

const ActionBarContainer = styled(Box)`
  display: flex;
  gap: 2px;
  padding: 2px 0 0 0;
  align-items: center;
  opacity: 0.15;
  transition: opacity 0.15s;
  /* becomes visible when parent turn wrapper is hovered */
  .turn-group:hover & {
    opacity: 1;
  }
`;

const SmallIconButton = styled(IconButton)`
  padding: 4px;
  & svg {
    font-size: 16px;
  }
`;

const FilesChangedChip = styled(Chip)`
  height: 20px;
  font-size: 11px;
  margin-right: 2px;
  & .MuiChip-label {
    padding: 0 6px;
  }
`;

interface TurnActionBarProps {
  userMessageId: string;
  turnMessageIds: string[];
  /** Callback when the turn is deleted — passes the original user text so the input can be pre-filled */
  onDeleteTurn?: (userText: string) => void;
}

export const TurnActionBar: React.FC<TurnActionBarProps> = memo(({ userMessageId, turnMessageIds, onDeleteTurn }) => {
  const deleteTurn = useAgentChatStore(state => state.deleteTurn);
  const retryTurn = useAgentChatStore(state => state.retryTurn);
  const agentId = useAgentChatStore(state => state.agent?.id);
  // Select only the specific user message metadata to avoid re-renders on every message update
  const userMessageMeta = useAgentChatStore(state => state.messages.get(userMessageId)?.metadata);

  const [changedFilesCount, setChangedFilesCount] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isRolledBack, setIsRolledBack] = useState(() => !!userMessageMeta?.rolledBack);

  // Check for beforeCommitMap and rolledBack status in user message metadata
  useEffect(() => {
    if (!userMessageMeta?.beforeCommitMap) return;
    if (userMessageMeta.rolledBack) {
      setIsRolledBack(true);
      setChangedFilesCount(0);
      return;
    }

    if (!agentId) return;

    let cancelled = false;
    void (window.service.agentInstance as { getTurnChangedFiles: (agentId: string, userMessageId: string) => Promise<Array<{ path: string; status: string }>> })
      .getTurnChangedFiles(agentId, userMessageId).then(files => {
        if (!cancelled) {
          setChangedFilesCount(files.length);
        }
      }).catch(() => {
        // Silently ignore — no git repo or no changes
      });

    return () => {
      cancelled = true;
    };
  }, [userMessageId, userMessageMeta?.beforeCommitMap, userMessageMeta?.rolledBack, agentId]);

  const handleRollback = useCallback(async () => {
    if (!agentId) return;

    setIsRollingBack(true);
    try {
      const result = await (window.service.agentInstance as { rollbackTurn: (agentId: string, userMessageId: string) => Promise<{ rolledBack: number; errors: string[] }> })
        .rollbackTurn(agentId, userMessageId);
      if (result.rolledBack > 0) {
        setIsRolledBack(true);
        setChangedFilesCount(0);
        // Also update the store so metadata stays in sync across remounts
        const updateMessage = useAgentChatStore.getState().updateMessage;
        const currentMessage = useAgentChatStore.getState().messages.get(userMessageId);
        if (currentMessage) {
          updateMessage({
            ...currentMessage,
            metadata: { ...currentMessage.metadata, rolledBack: true, rollbackTimestamp: new Date().toISOString() },
          });
        }
      }
      if (result.errors.length > 0) {
        console.warn('Rollback errors:', result.errors);
      }
    } catch (error) {
      console.error('Rollback failed:', error);
    } finally {
      setIsRollingBack(false);
    }
  }, [agentId, userMessageId]);

  const handleRetry = useCallback(() => {
    void retryTurn(userMessageId);
  }, [retryTurn, userMessageId]);

  const handleDelete = useCallback(() => {
    void deleteTurn(userMessageId).then(text => {
      if (text && onDeleteTurn) onDeleteTurn(text);
    });
  }, [deleteTurn, userMessageId, onDeleteTurn]);

  const handleCopy = useCallback(() => {
    // Collect agent response text from this turn (skip user message)
    const storeMessages = useAgentChatStore.getState().messages;
    const agentText = turnMessageIds
      .filter(id => id !== userMessageId)
      .map(id => {
        const message = storeMessages.get(id);
        if (!message) return '';
        return stripToolXml(message.content) || '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (agentText) void navigator.clipboard.writeText(agentText);
  }, [turnMessageIds, userMessageId]);

  const handleCopyAll = useCallback(() => {
    const allMessages = useAgentChatStore.getState();
    const allText = allMessages.orderedMessageIds
      .map(id => {
        const message = allMessages.messages.get(id);
        if (!message) return '';
        const role = message.role === 'user' ? 'User' : 'Agent';
        const content = stripToolXml(message.content) || '';
        return content ? `${role}: ${content}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (allText) void navigator.clipboard.writeText(allText);
  }, []);

  return (
    <ActionBarContainer data-testid='turn-action-bar'>
      {changedFilesCount !== null && changedFilesCount > 0 && !isRolledBack && (
        <FilesChangedChip
          label={`${changedFilesCount} file${changedFilesCount > 1 ? 's' : ''} changed`}
          size='small'
          variant='outlined'
          color='info'
          data-testid='turn-files-changed'
        />
      )}
      {changedFilesCount !== null && changedFilesCount > 0 && !isRolledBack && (
        <Tooltip title='Rollback file changes from this turn'>
          <SmallIconButton
            onClick={() => void handleRollback()}
            size='small'
            disabled={isRollingBack}
            data-testid='turn-action-rollback'
          >
            {isRollingBack ? <CircularProgress size={14} /> : <RestoreIcon />}
          </SmallIconButton>
        </Tooltip>
      )}
      {isRolledBack && (
        <FilesChangedChip
          label='Rolled back'
          size='small'
          variant='outlined'
          color='success'
          data-testid='turn-rolled-back'
        />
      )}
      <Tooltip title='Retry this turn'>
        <SmallIconButton onClick={handleRetry} size='small' data-testid='turn-action-retry'>
          <ReplayIcon />
        </SmallIconButton>
      </Tooltip>
      <Tooltip title='Delete turn & return input'>
        <SmallIconButton onClick={handleDelete} size='small' data-testid='turn-action-delete'>
          <DeleteOutlineIcon />
        </SmallIconButton>
      </Tooltip>
      <Tooltip title='Copy agent response'>
        <SmallIconButton onClick={handleCopy} size='small' data-testid='turn-action-copy'>
          <ContentCopyIcon />
        </SmallIconButton>
      </Tooltip>
      <Tooltip title='Copy all messages'>
        <SmallIconButton onClick={handleCopyAll} size='small' data-testid='turn-action-copy-all'>
          <CopyAllIcon />
        </SmallIconButton>
      </Tooltip>
    </ActionBarContainer>
  );
});

TurnActionBar.displayName = 'TurnActionBar';
