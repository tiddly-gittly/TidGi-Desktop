import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { ChatSession } from '../ChatSessionUI';

const Item = styled.div<{ active?: boolean }>`
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-left: 3px solid ${props => (props.active ? props.theme.palette.primary.main : 'transparent')};
  background-color: ${props => (props.active
  ? (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
  : 'transparent')};
  
  &:hover {
    background-color: ${props => (props.active
  ? (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
  : (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'))};
  }
`;

const Title = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const DeleteButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.palette.text.secondary};
  cursor: pointer;
  opacity: 0.7;
  
  &:hover {
    opacity: 1;
    color: ${props => props.theme.palette.error.main};
  }
`;

interface SessionListItemProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export const SessionListItem: React.FC<SessionListItemProps> = ({
  session,
  isActive,
  onSelect,
  onDelete,
}) => {
  const { t } = useTranslation('agent');

  return (
    <Item
      active={isActive}
      onClick={() => {
        onSelect(session.id);
      }}
    >
      <Title>{session.title || `${t('Chat.Session', { ns: 'agent' })} ${session.id}`}</Title>
      <DeleteButton
        onClick={(event) => {
          event.stopPropagation();
          onDelete(session.id);
        }}
      >
        ✕
      </DeleteButton>
    </Item>
  );
};
