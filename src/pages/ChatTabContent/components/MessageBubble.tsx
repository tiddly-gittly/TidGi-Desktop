// Message bubble component with avatar and content

import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Avatar, Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { isMessageExpiredForAI } from '../../../services/agentInstance/utilities/messageDurationFilter';
import { useAgentChatStore } from '../../Agent/store/agentChatStore/index';
import { MessageRenderer } from './MessageRenderer';

const ImageAttachment = ({ file }: { file: File | { path: string } }) => {
  const [source, setSource] = React.useState<string | undefined>();

  React.useEffect(() => {
    // Check for File object (from current session upload)
    if (file instanceof File) {
      const url = URL.createObjectURL(file);
      setSource(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } // Check for persisted file object with path
    else if (file && typeof file === 'object' && 'path' in file) {
      setSource(`file://${(file as { path: string }).path}`);
    }
  }, [file]);

  if (!source) return null;

  return (
    <Box
      component='img'
      src={source}
      data-testid='message-image-attachment'
      sx={{
        maxWidth: '100%',
        maxHeight: 300,
        borderRadius: 1,
        mb: 1,
        display: 'block',
        cursor: 'pointer',
      }}
      onClick={() => {
        const win = window.open();
        if (win) {
          win.document.body.innerHTML = `<img src="${src}" style="max-width:100%"/>`;
        }
      }}
    />
  );
};

const BubbleContainer = styled(Box, {
  shouldForwardProp: (property) => property !== '$user' && property !== '$centered' && property !== '$expired',
})<{ $user: boolean; $centered: boolean; $expired?: boolean }>`
  display: flex;
  gap: 12px;
  max-width: 80%;
  align-self: ${props => props.$centered ? 'center' : props.$user ? 'flex-end' : 'flex-start'};
  opacity: ${props => props.$expired ? 0.5 : 1};
  transition: opacity 0.3s ease-in-out;
`;

const MessageAvatar = styled(Avatar, {
  shouldForwardProp: (property) => property !== '$user' && property !== '$centered' && property !== '$expired',
})<{ $user: boolean; $centered: boolean; $expired?: boolean }>`
  background-color: ${props => props.$centered ? props.theme.palette.info.main : props.$user ? props.theme.palette.primary.main : props.theme.palette.secondary.main};
  color: ${props => props.$centered ? props.theme.palette.info.contrastText : props.$user ? props.theme.palette.primary.contrastText : props.theme.palette.secondary.contrastText};
  opacity: ${props => props.$expired ? 0.7 : 1};
  transition: opacity 0.3s ease-in-out;
`;

const MessageContent = styled(Box, {
  shouldForwardProp: (property) => property !== '$user' && property !== '$centered' && property !== '$streaming' && property !== '$expired',
})<{ $user: boolean; $centered: boolean; $streaming?: boolean; $expired?: boolean }>`
  background-color: ${props => props.$user ? props.theme.palette.primary.light : props.theme.palette.background.paper};
  color: ${props => props.$user ? props.theme.palette.primary.contrastText : props.theme.palette.text.primary};
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  position: relative;
  transition: all 0.3s ease-in-out;
  opacity: ${props => props.$expired ? 0.6 : 1};
  
  /* Add visual indicators for expired messages */
  ${props =>
  props.$expired && `
    border: 1px dashed ${props.theme.palette.divider};
    filter: grayscale(0.3);
  `}
  
  /* Add a subtle highlight for completed assistant messages */
  ${props =>
  !props.$user && !props.$streaming && !props.$expired && `
    border-left: 2px solid ${props.theme.palette.divider};
  `}
  
  /* Enhanced animation for streaming messages with eventual fade out */
  ${props =>
  props.$streaming && `
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
  const orderedMessageIds = useAgentChatStore(state => state.orderedMessageIds);

  if (!message) return null;

  const isUser = message.role === 'user';
  // Treat 'error' and tool centered, no avatar, differenciate it from normal chat bubbles
  const isCentered = message.role === 'tool' || message.role === 'error';
  // Calculate if message is expired for AI context
  const messageIndex = orderedMessageIds.indexOf(messageId);
  const totalMessages = orderedMessageIds.length;
  const isExpired = isMessageExpiredForAI(message, messageIndex, totalMessages);

  return (
    <BubbleContainer $user={isUser} $centered={isCentered} $expired={isExpired} data-testid='message-bubble'>
      {!isUser && !isCentered && (
        <MessageAvatar $user={isUser} $centered={isCentered} $expired={isExpired}>
          <SmartToyIcon />
        </MessageAvatar>
      )}

      <MessageContent
        $user={isUser}
        $centered={isCentered}
        $streaming={isStreaming}
        $expired={isExpired}
        data-testid={!isUser ? (isStreaming ? 'assistant-streaming-text' : 'assistant-message') : undefined}
      >
        {message.metadata?.file && <ImageAttachment file={message.metadata.file as File | { path: string }} />}
        <MessageRenderer message={message} isUser={isUser} />
      </MessageContent>

      {isUser && (
        <MessageAvatar $user={isUser} $centered={isCentered} $expired={isExpired}>
          <PersonIcon />
        </MessageAvatar>
      )}
    </BubbleContainer>
  );
};
