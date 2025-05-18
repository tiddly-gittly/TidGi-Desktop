// Message bubble component with avatar and content

import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Avatar, Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useAgentChatStore } from '../../../../../store/agentChatStore';
import { MessageRenderer } from './MessageRenderer';

const BubbleContainer = styled(Box)<{ $isUser: boolean }>`
  display: flex;
  gap: 12px;
  max-width: 80%;
  align-self: ${props => props.$isUser ? 'flex-end' : 'flex-start'};
`;

const MessageAvatar = styled(Avatar)<{ $isUser: boolean }>`
  background-color: ${props => props.$isUser ? props.theme.palette.primary.main : props.theme.palette.secondary.main};
  color: ${props => props.$isUser ? props.theme.palette.primary.contrastText : props.theme.palette.secondary.contrastText};
`;

const MessageContent = styled(Box)<{ $isUser: boolean; $isStreaming?: boolean }>`
  background-color: ${props => props.$isUser ? props.theme.palette.primary.light : props.theme.palette.background.paper};
  color: ${props => props.$isUser ? props.theme.palette.primary.contrastText : props.theme.palette.text.primary};
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  position: relative;
  transition: all 0.3s ease-in-out;
  
  /* Add a subtle highlight for completed assistant messages */
  ${props =>
  !props.$isUser && !props.$isStreaming && `
    border-left: 2px solid ${props.theme.palette.divider};
  `}
  
  /* Enhanced animation for streaming messages with eventual fade out */
  ${props =>
  props.$isStreaming && `
    box-shadow: 0 1px 5px rgba(0,100,255,0.3);
    border-left: 2px solid ${props.theme.palette.primary.main};
    
    &:after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(to right, transparent, ${props.theme.palette.primary.main}, transparent);
      animation: streamingPulse 2s ease-in-out infinite;
    }
    
    @keyframes streamingPulse {
      0% { opacity: 0.3; }
      50% { opacity: 0.8; }
      100% { opacity: 0.3; }
    }
  `}
`;

interface MessageBubbleProps {
  messageId: string; // 只接收消息ID
}

/**
 * Message bubble component with avatar and content
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({ messageId }) => {
  const message = useAgentChatStore(state => state.getMessageById(messageId));
  const isStreaming = useAgentChatStore(state => state.isMessageStreaming(messageId));

  if (!message) return null;

  const isUser = message.role === 'user';

  return (
    <BubbleContainer $isUser={isUser}>
      {!isUser && (
        <MessageAvatar $isUser={isUser}>
          <SmartToyIcon />
        </MessageAvatar>
      )}

      <MessageContent $isUser={isUser} $isStreaming={isStreaming}>
        <MessageRenderer message={message} isUser={isUser} />
      </MessageContent>

      {isUser && (
        <MessageAvatar $isUser={isUser}>
          <PersonIcon />
        </MessageAvatar>
      )}
    </BubbleContainer>
  );
};
