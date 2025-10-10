// Thinking content renderer component

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Collapse, IconButton, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageRendererProps } from './types';

const ThinkingWrapper = styled(Box)`
  width: 100%;
`;

const ThinkingHeader = styled(Box)`
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 8px;
`;

const ThinkingContent = styled(Paper)`
  padding: 12px;
  margin-top: 8px;
  background-color: ${props => props.theme.palette.grey[100]};
  border-radius: 8px;
  font-family: monospace;
`;

/**
 * Extract thinking content from a message with various thinking tags
 */
function extractThinkingContent(content: string): { mainContent: string; thinkingContent: string } {
  // Support multiple thinking tag formats:
  // 1. Claude style: <thinking>...</thinking> or <think>...</think>
  // 2. DeepSeek-R1 style: <|思考|>...</|思考|> or <reasoning>...</reasoning>
  // 3. General XML style tags that might indicate thinking: <reflection>...</reflection>, etc.
  const thinkingRegexes = [
    // Claude style
    /<(thinking|think)>([\s\S]*?)<\/\1>/i,
    // DeepSeek-R1 style
    /<\|思考\|>([\s\S]*?)<\/\|思考\|>/i,
    /<(reasoning|理性思考)>([\s\S]*?)<\/\1>/i,
    // Other potential thinking tags
    /<(reflection|reflect|internal-monologue|thought-process)>([\s\S]*?)<\/\1>/i,
  ];

  let mainContent = content;
  let thinkingContent = '';

  // Try each regex pattern
  for (const regex of thinkingRegexes) {
    const match = content.match(regex);
    if (match) {
      // For DeepSeek style, the captured group index might be different
      const capturedContent = match[2] || match[1];
      thinkingContent = capturedContent.trim();

      // Remove thinking tags from main content
      mainContent = content.replace(match[0], '').trim();
      break;
    }
  }

  return { mainContent, thinkingContent };
}

/**
 * Renderer for messages containing thinking content
 * Displays thinking content in a collapsible section
 * Supports both DeepSeek's dedicated reasoning_content and XML tag-based thinking content
 */
export const ThinkingMessageRenderer: React.FC<MessageRendererProps> = ({ message }) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation('agent');

  // Handle both dedicated reasoning_content and embedded XML thinking tags
  let mainContent: string;
  let thinkingContent: string;

  if (message.reasoning_content) {
    // If reasoning_content is available (DeepSeek format), use it directly
    mainContent = message.content;
    thinkingContent = message.reasoning_content;
  } else {
    // Otherwise extract thinking content from XML tags in content (Claude, OpenAI format)
    const extracted = extractThinkingContent(message.content);
    mainContent = extracted.mainContent;
    thinkingContent = extracted.thinkingContent;
  }

  const toggleExpanded = () => {
    setExpanded(previous => !previous);
  };

  return (
    <ThinkingWrapper>
      {mainContent && (
        <Typography variant='body1' sx={{ mb: 1 }}>
          {mainContent}
        </Typography>
      )}

      {thinkingContent && (
        <>
          <ThinkingHeader onClick={toggleExpanded}>
            <Typography variant='body2' color='text.secondary' fontWeight='medium'>
              {t('Agent.ThinkingProcess')}
            </Typography>
            <IconButton size='small' sx={{ ml: 1 }}>
              {expanded ? <ExpandLessIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
            </IconButton>
          </ThinkingHeader>

          <Collapse in={expanded}>
            <ThinkingContent elevation={0}>
              <Typography variant='body2' whiteSpace='pre-wrap'>
                {thinkingContent}
              </Typography>
            </ThinkingContent>
          </Collapse>
        </>
      )}
    </ThinkingWrapper>
  );
};
