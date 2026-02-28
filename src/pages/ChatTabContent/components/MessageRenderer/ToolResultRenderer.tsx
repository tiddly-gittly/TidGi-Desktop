/**
 * Generic Tool Result Renderer
 *
 * Renders <functions_result> messages that don't have a specialized renderer.
 * Shows tool name, collapsible parameters, and the result content in a clean card.
 */
import BuildIcon from '@mui/icons-material/Build';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo, useMemo, useState } from 'react';
import { stripToolXml } from './BaseMessageRenderer';
import { MessageRendererProps } from './types';

const ToolResultContainer = styled(Box, {
  shouldForwardProp: (property) => property !== 'isError',
})<{ isError?: boolean }>`
  width: 100%;
  padding: 8px 12px;
  background: ${props => props.theme.palette.action.hover};
  border-radius: 8px;
  border-left: 3px solid ${props => props.isError ? props.theme.palette.error.main : props.theme.palette.grey[500]};
`;

const ToolHeader = styled(Box)`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
`;

const ResultContent = styled(Typography)`
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.875rem;
  margin-top: 4px;
`;

const ParametersContent = styled(Box)`
  font-family: monospace;
  font-size: 0.8rem;
  color: ${props => props.theme.palette.text.secondary};
  background: ${props => props.theme.palette.background.paper};
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
`;

interface ParsedToolResult {
  toolName: string;
  parameters: string;
  result: string;
  isError: boolean;
}

function parseToolResult(content: string): ParsedToolResult | null {
  const toolMatch = /Tool:\s*(.+)/m.exec(content);
  const parametersMatch = /Parameters:\s*(.+)/m.exec(content);
  const resultMatch = /(?:Result|Error):\s*([\s\S]+?)\s*(?:<\/functions_result>|$)/m.exec(content);
  const isError = /Error:\s/.test(content);

  if (!toolMatch) return null;

  return {
    toolName: toolMatch[1].trim(),
    parameters: parametersMatch?.[1]?.trim() ?? '',
    result: resultMatch?.[1]?.trim() ?? '',
    isError,
  };
}

export const ToolResultRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const [expanded, setExpanded] = useState(false);

  const parsed = useMemo(() => parseToolResult(message.content), [message.content]);

  if (!parsed) {
    const cleaned = stripToolXml(message.content);
    return cleaned ? <ResultContent>{cleaned}</ResultContent> : null;
  }

  // Truncate long results for the collapsed view
  const resultPreview = parsed.result.length > 200
    ? `${parsed.result.slice(0, 200)}…`
    : parsed.result;

  return (
    <ToolResultContainer isError={parsed.isError} data-testid={`tool-result-${parsed.isError ? 'error' : 'success'}`} data-tool-name={parsed.toolName}>
      <ToolHeader
        onClick={() => {
          setExpanded(p => !p);
        }}
      >
        <BuildIcon fontSize='small' color={parsed.isError ? 'error' : 'action'} />
        <Typography variant='subtitle2' color={parsed.isError ? 'error.main' : 'text.secondary'}>
          {parsed.toolName}
        </Typography>
        <IconButton size='small' sx={{ ml: 'auto' }}>
          {expanded ? <ExpandLessIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
        </IconButton>
      </ToolHeader>

      {!expanded && <ResultContent color='text.secondary'>{resultPreview}</ResultContent>}

      {expanded && (
        <Box>
          {parsed.parameters && <ParametersContent>{parsed.parameters}</ParametersContent>}
          <ResultContent sx={{ mt: 1 }}>{parsed.result}</ResultContent>
        </Box>
      )}
    </ToolResultContainer>
  );
});

ToolResultRenderer.displayName = 'ToolResultRenderer';
