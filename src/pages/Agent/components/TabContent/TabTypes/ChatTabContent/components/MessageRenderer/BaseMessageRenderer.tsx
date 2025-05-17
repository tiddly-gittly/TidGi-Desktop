// Base message renderer component

import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { MessageRendererProps } from './types';

const MessageContentWrapper = styled(Box)`
  width: 100%;
`;

/**
 * Default message renderer that displays simple text content
 * Avoiding any duplication of reasoning_content when that's already rendered separately
 */
export const BaseMessageRenderer: React.FC<MessageRendererProps> = ({ message }) => {
  // Render only the main content directly
  const content = message.content || '';

  return (
    <MessageContentWrapper>
      <Typography variant='body1' sx={{ whiteSpace: 'pre-wrap' }}>{content}</Typography>
    </MessageContentWrapper>
  );
};
