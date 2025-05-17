// Messages container component

import { AgentInstanceMessage } from '@/services/agentInstance/interface';
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { ReactNode } from 'react';
import { MessageBubble } from './MessageBubble';

const Container = styled(Box)`
  flex: 1;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: ${props => props.theme.palette.background.default};
`;

interface MessagesContainerProps {
  messages: AgentInstanceMessage[];
  children?: ReactNode;
}

/**
 * Container component for all chat messages
 * Displays messages as message bubbles and can render additional content (loading states, errors, etc.)
 */
export const MessagesContainer: React.FC<MessagesContainerProps> = ({ messages, children }) => {
  return (
    <Container id='messages-container'>
      {/* Render messages as message bubbles */}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isUser={message.role === 'user'}
        />
      ))}

      {/* Render additional content (loading states, errors, empty states) */}
      {children}
    </Container>
  );
};
