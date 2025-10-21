import { Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { AgentInstance } from '@services/agentInstance/interface';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Title = styled(Typography)`
  font-weight: 600;
  flex: 1;
`;

interface ChatTitleProps {
  title?: string;
  agent?: Omit<AgentInstance, 'messages'> | null;
  updateAgent?: (data: Partial<AgentInstance>) => Promise<unknown>;
}

export const ChatTitle: React.FC<ChatTitleProps> = ({ title, agent, updateAgent }) => {
  const { t } = useTranslation('agent');
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const inputReference = useRef<HTMLInputElement | null>(null);

  const displayTitle = title || agent?.name || t('Agent.Untitled');

  useEffect(() => {
    if (!editing) {
      setTitleInput(displayTitle);
    }
  }, [displayTitle, editing]);

  useEffect(() => {
    if (editing) {
      inputReference.current?.focus();
      inputReference.current?.select();
    }
  }, [editing]);

  const handleStartEdit = () => {
    setTitleInput(displayTitle);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setTitleInput(displayTitle);
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    const newTitle = titleInput?.trim();
    if (!agent?.id) {
      setEditing(false);
      return;
    }

    // if nothing changed, just exit
    if (newTitle === (agent.name || '')) {
      setEditing(false);
      return;
    }

    try {
      setEditing(false);
      if (updateAgent) {
        await updateAgent({ name: newTitle });
      }
    } catch (error) {
      void window.service?.native?.log?.('error', 'Failed to save agent title', { function: 'ChatTitle.handleSaveEdit', error });
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter') {
      void handleSaveEdit();
    } else if (event.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <Title variant='h6'>
      {editing
        ? (
          <input
            ref={inputReference}
            value={titleInput}
            onChange={(event) => {
              setTitleInput(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => void handleSaveEdit()}
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              width: '100%',
            }}
            aria-label={t('Agent.EditTitle')}
          />
        )
        : (
          <span onClick={handleStartEdit} style={{ cursor: 'pointer' }} title={displayTitle}>
            {displayTitle}
          </span>
        )}
    </Title>
  );
};

export default ChatTitle;
