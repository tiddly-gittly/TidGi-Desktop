// Messages container component

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
  messageIds: string[];
  children?: ReactNode;
  isSplitView?: boolean;
}

/**
 * Container component for all chat messages
 * Displays messages as message bubbles and can render additional content (loading states, errors, etc.)
 * 使用消息 ID 来减少不必要的重渲染
 */
export const MessagesContainer: React.FC<MessagesContainerProps> = ({ messageIds, children, isSplitView }) => {
  return (
    <Container id='messages-container'>
      {messageIds.map((messageId) => (
        <MessageBubble
          key={messageId}
          messageId={messageId}
          isSplitView={isSplitView}
        />
      ))}
      {children}
    </Container>
  );
};
