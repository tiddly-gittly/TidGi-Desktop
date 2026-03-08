// Message bubble component — user messages retain bubble styling; agent/tool messages are chrome-less

import { WikiChannel } from '@/constants/channels';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import PersonIcon from '@mui/icons-material/Person';
import { Avatar, Box, Chip } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo } from 'react';
import { isMessageExpiredForAI } from '../../../services/agentInstance/utilities/messageDurationFilter';
import { useAgentChatStore } from '../../Agent/store/agentChatStore/index';
import { MessageRenderer } from './MessageRenderer';

const ImageAttachment = ({ file }: { file: File | { path: string } }) => {
  const [source, setSource] = React.useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>();

  React.useEffect(() => {
    // Check for File object (from current session upload)
    if (file instanceof File) {
      const url = URL.createObjectURL(file);
      setSource(url);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } // Check for persisted file object with path
    else if (file && typeof file === 'object' && 'path' in file) {
      const filePath = `file://${(file as { path: string }).path}`;
      setSource(filePath);
      setPreviewUrl(filePath);
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
        if (!previewUrl) return;
        const win = window.open();
        if (win) {
          const img = win.document.createElement('img');
          img.src = previewUrl;
          img.style.maxWidth = '100%';
          win.document.body.append(img);
        }
      }}
    />
  );
};

interface WikiTiddlerMetadata {
  workspaceId: string;
  workspaceName: string;
  tiddlerTitle: string;
  renderedContent?: string;
}

const WikiTiddlersAttachment = ({ tiddlers, isSplitView }: { tiddlers: WikiTiddlerMetadata[]; isSplitView?: boolean }) => {
  if (!tiddlers || tiddlers.length === 0) return null;

  const handleTiddlerClick = (tiddler: WikiTiddlerMetadata) => {
    void (async () => {
      try {
        if (isSplitView) {
          // In split view: directly open the tiddler in the wiki view that's already displayed
          // The wiki webview should be on the right side of the split view
          await window.service.wiki.wikiOperationInBrowser(WikiChannel.openTiddler, tiddler.workspaceId, [
            tiddler.tiddlerTitle,
          ]);
        } else {
          // In normal tab: activate the wiki workspace
          await window.service.workspaceView.setActiveWorkspaceView(tiddler.workspaceId);
        }

        void window.service.native.log('debug', 'Navigated to wiki tiddler', {
          workspaceId: tiddler.workspaceId,
          workspaceName: tiddler.workspaceName,
          tiddlerTitle: tiddler.tiddlerTitle,
          isSplitView,
        });
      } catch (error) {
        void window.service.native.log('error', 'Failed to navigate to wiki tiddler', {
          error,
          workspaceId: tiddler.workspaceId,
          tiddlerTitle: tiddler.tiddlerTitle,
          isSplitView,
        });
      }
    })();
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
      {tiddlers.map((tiddler, index) => (
        <Chip
          key={index}
          icon={<LibraryBooksIcon />}
          label={`${tiddler.workspaceName}: ${tiddler.tiddlerTitle}`}
          data-testid={`wiki-tiddler-chip-message-${index}`}
          sx={{ maxWidth: 300, cursor: 'pointer' }}
          title={tiddler.renderedContent ? tiddler.renderedContent.substring(0, 100) + '...' : tiddler.tiddlerTitle}
          onClick={() => {
            handleTiddlerClick(tiddler);
          }}
        />
      ))}
    </Box>
  );
};

const BubbleContainer = styled(Box, {
  shouldForwardProp: (property) => property !== '$user' && property !== '$expired',
})<{ $user: boolean; $expired?: boolean }>`
  display: flex;
  gap: 12px;
  max-width: ${props => props.$user ? '80%' : '100%'};
  align-self: ${props => props.$user ? 'flex-end' : 'flex-start'};
  opacity: ${props => props.$expired ? 0.5 : 1};
  transition: opacity 0.3s ease-in-out;
`;

const MessageAvatar = styled(Avatar)`
  background-color: ${props => props.theme.palette.primary.main};
  color: ${props => props.theme.palette.primary.contrastText};
`;

/** User bubble keeps card-like styling */
const UserMessageContent = styled(Box)`
  background-color: ${props => props.theme.palette.primary.light};
  color: ${props => props.theme.palette.primary.contrastText};
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
`;

/** Agent messages have no bubble chrome — content renders directly */
const AgentMessageContent = styled(Box, {
  shouldForwardProp: (property) => property !== '$streaming' && property !== '$expired',
})<{ $streaming?: boolean; $expired?: boolean }>`
  width: 100%;
  position: relative;
  transition: all 0.3s ease-in-out;
  opacity: ${props => props.$expired ? 0.6 : 1};

  ${props =>
  props.$expired && `
    filter: grayscale(0.3);
  `}

  ${props =>
  props.$streaming && `
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
  messageId: string;
  isSplitView?: boolean;
}

/**
 * Message bubble component.
 * User messages: right-aligned with avatar + card bubble.
 * Agent/tool/error messages: full-width, no avatar, no card — renders content directly so
 * multiple outputs in one turn feel cohesive.
 */
export const MessageBubble: React.FC<MessageBubbleProps> = memo(({ messageId, isSplitView }) => {
  const message = useAgentChatStore(state => state.getMessageById(messageId));
  const isStreaming = useAgentChatStore(state => state.isMessageStreaming(messageId));
  const orderedMessageIds = useAgentChatStore(state => state.orderedMessageIds);

  if (!message) return null;

  const isUser = message.role === 'user';
  const messageIndex = orderedMessageIds.indexOf(messageId);
  const totalMessages = orderedMessageIds.length;
  const isExpired = isMessageExpiredForAI(message, messageIndex, totalMessages);

  // User message: keep the classic bubble
  if (isUser) {
    return (
      <BubbleContainer $user $expired={isExpired} data-testid='message-bubble'>
        <UserMessageContent>
          {message.metadata?.file ? <ImageAttachment file={message.metadata.file as File | { path: string }} /> : null}
          {message.metadata?.wikiTiddlers ? <WikiTiddlersAttachment tiddlers={message.metadata.wikiTiddlers as WikiTiddlerMetadata[]} isSplitView={isSplitView} /> : null}
          <MessageRenderer message={message} isUser />
        </UserMessageContent>
        <MessageAvatar>
          <PersonIcon />
        </MessageAvatar>
      </BubbleContainer>
    );
  }

  // Agent / tool / error: no avatar, no bubble chrome
  return (
    <BubbleContainer $user={false} $expired={isExpired} data-testid='message-bubble'>
      <AgentMessageContent
        $streaming={isStreaming}
        $expired={isExpired}
        data-testid={isStreaming ? 'assistant-streaming-text' : 'assistant-message'}
      >
        {message.metadata?.file ? <ImageAttachment file={message.metadata.file as File | { path: string }} /> : null}
        {message.metadata?.wikiTiddlers ? <WikiTiddlersAttachment tiddlers={message.metadata.wikiTiddlers as WikiTiddlerMetadata[]} isSplitView={isSplitView} /> : null}
        <MessageRenderer message={message} isUser={false} />
      </AgentMessageContent>
    </BubbleContainer>
  );
});

MessageBubble.displayName = 'MessageBubble';
