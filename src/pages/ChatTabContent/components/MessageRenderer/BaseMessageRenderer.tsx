// Base message renderer component

import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { useMemo } from 'react';
import { MessageRendererProps } from './types';

const MessageContentWrapper = styled(Box)`
  width: 100%;
`;

/**
 * Strip tool-call and tool-result XML tags from content so users never see raw XML.
 * Handles both complete tags (with closing) and partial/unclosed tags (during streaming).
 * Covers <tool_use>, <function_call>, <parallel_tool_calls>, and <functions_result>.
 *
 * Exported so other renderers can use it in their fallback paths.
 */
export function stripToolXml(content: string): string {
  let cleaned = content;
  // Remove <parallel_tool_calls>...</parallel_tool_calls> wrapper (or unclosed)
  cleaned = cleaned.replace(/<\/?parallel_tool_calls>/gi, '');
  // Remove complete <tool_use name="...">...</tool_use> blocks
  cleaned = cleaned.replace(/<tool_use\s+name="[^"]*"[^>]*>[\s\S]*?<\/tool_use>/gi, '');
  // Remove complete <function_call name="...">...</function_call> blocks
  cleaned = cleaned.replace(/<function_call\s+name="[^"]*"[^>]*>[\s\S]*?<\/function_call>/gi, '');
  // Remove complete <functions_result>...</functions_result> blocks
  cleaned = cleaned.replace(/<functions_result>[\s\S]*?<\/functions_result>/gi, '');
  // Remove partial/unclosed tags (during streaming, before closing tag arrives)
  cleaned = cleaned.replace(/<tool_use\s[^>]*>[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/<function_call\s[^>]*>[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/<functions_result>[\s\S]*$/gi, '');
  // Remove lone opening angle bracket at end (tag still being typed)
  cleaned = cleaned.replace(/<(?:tool_use|function_call|functions_result|parallel_tool_calls)\b[^>]*$/gi, '');
  // Clean up multiple blank lines left behind
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * Default message renderer that displays simple text content.
 * Strips tool-call XML tags so users see only human-readable text.
 */
export const BaseMessageRenderer: React.FC<MessageRendererProps> = ({ message }) => {
  const content = useMemo(() => stripToolXml(message.content || ''), [message.content]);

  if (!content) return null;

  return (
    <MessageContentWrapper>
      <Typography variant='body1' sx={{ whiteSpace: 'pre-wrap' }}>{content}</Typography>
    </MessageContentWrapper>
  );
};
