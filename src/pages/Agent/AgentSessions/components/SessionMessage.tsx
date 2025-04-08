import { Conversation } from '@services/agent/interface';
import React from 'react';
import styled from 'styled-components';

const MessageBubble = styled.div<{ isUser?: boolean }>`
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
  align-self: ${props => (props.isUser ? 'flex-end' : 'flex-start')};
  background-color: ${props => (props.isUser
  ? props.theme.palette.primary.main
  : (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'))};
  color: ${props => (props.isUser
  ? props.theme.palette.primary.contrastText
  : props.theme.palette.text.primary)};
  word-break: break-word;
`;

const MessageTime = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.palette.text.secondary};
  margin-top: 4px;
  text-align: right;
`;

interface SessionMessageProps {
  conversation: Conversation;
}

export const SessionMessage: React.FC<SessionMessageProps> = ({ conversation }) => {
  const formatTime = (date?: Date) => {
    if (!date) return '';
    return date instanceof Date
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <MessageBubble isUser>
        {conversation.question}
        <MessageTime>{formatTime(conversation.createdAt)}</MessageTime>
      </MessageBubble>
      {conversation.response && (
        <MessageBubble>
          {conversation.response}
          <MessageTime>{formatTime(conversation.updatedAt)}</MessageTime>
        </MessageBubble>
      )}
    </>
  );
};
