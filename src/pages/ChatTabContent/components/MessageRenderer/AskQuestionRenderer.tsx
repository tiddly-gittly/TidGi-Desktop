/**
 * Ask Question Message Renderer
 *
 * Delegates to the reusable AskQuestionContent from @memeloop/react-ui/chat.
 * This host-specific renderer is kept only so the existing message-renderer
 * registry continues to route ask-question messages to the right UI.
 */
import { AskQuestionContent } from '@memeloop/react-ui/chat';
import React, { memo } from 'react';

import { MessageRendererProps } from './types';

export const AskQuestionRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const agentId = message.metadata?.agentId as string | undefined;
  return <AskQuestionContent message={message} agentId={agentId} />;
});

AskQuestionRenderer.displayName = 'AskQuestionRenderer';
