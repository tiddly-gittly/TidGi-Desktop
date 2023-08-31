import ChatBubbleOutline from '@mui/icons-material/ChatBubbleOutline';
import { Box, IconButton, Typography } from '@mui/material';
import React, { useRef } from 'react';
import { styled } from 'styled-components';
import { plugins } from '../DebugPanel/plugins';
import { useChatsStore } from './useChatsStore';

const Container = styled.div`
  padding: 0 1em;
  height: 100%;
  overflow-y: auto;
  &::-webkit-scrollbar {
    width: 0;
  }
`;

interface Props {
  chatID: string;
}

export const ChatArea: React.FC<Props> = ({ chatID }) => {
  /**
   * Use the chatsStore to get the relevant chat elements.
   */
  const elements = useChatsStore((state) => state.chats[chatID]?.chatJSON?.elements ?? {});

  /**
   * Ref to the Container element for scrolling
   */
  const containerReference = useRef<HTMLDivElement | null>(null);

  const onSubmit = useChatsStore((state) => (id: string, content: unknown) => {
    state.submitElementInChat(chatID, id, content);
  });

  return (
    <Container ref={containerReference}>
      {Object.values(elements).map(element => {
        // eslint-disable-next-line unicorn/no-null, @typescript-eslint/strict-boolean-expressions
        if (!element) return null;

        const { type, id, props = {}, isSubmitted, timestamp } = element;
        const plugin = plugins.find(p => p.type === type);
        if (plugin === undefined) {
          // TODO: return a placeholder element instead
          // eslint-disable-next-line unicorn/no-null
          return null;
        }
        const { Component } = plugin;
        return (
          <div key={id}>
            <Typography color='textSecondary'>
              {new Date(timestamp).toLocaleTimeString()}
            </Typography>
            <Component {...props} onSubmit={onSubmit} id={id} isSubmitted={isSubmitted} />
          </div>
        );
      })}
    </Container>
  );
};

const EmptyContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.7;
`;
export const EmptyChatArea: React.FC = () => {
  return (
    <EmptyContainer>
      <IconButton color='primary' size='large'>
        <ChatBubbleOutline fontSize='inherit' />
      </IconButton>
      <Typography variant='h6' gutterBottom>
        No Chat Selected
      </Typography>
      <Typography color='textSecondary'>
        Start a chat by sending a message.
      </Typography>
    </EmptyContainer>
  );
};
