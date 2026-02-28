/**
 * WikiText Message Renderer
 *
 * Renders wikitext content using TiddlyWiki's server-side renderer.
 * Falls back to pre-formatted text if rendering fails.
 * Supports streaming: partial content shows with reduced opacity, final content is fully opaque.
 */
import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useRenderWikiText } from '@services/wiki/hooks';
import React, { memo, useMemo } from 'react';
import { MessageRendererProps } from './types';

const WikitextWrapper = styled(Box)<{ $isStreaming?: boolean }>`
  width: 100%;
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  transition: opacity 0.3s ease;
  opacity: ${props => props.$isStreaming ? 0.7 : 1};

  /* TiddlyWiki rendered HTML styles */
  & h1, & h2, & h3, & h4, & h5, & h6 {
    margin: 0.5em 0 0.25em;
    line-height: 1.3;
  }
  & h1 { font-size: 1.4em; }
  & h2 { font-size: 1.2em; }
  & h3 { font-size: 1.1em; }

  & p { margin: 0.3em 0; }
  & ul, & ol { margin: 0.3em 0; padding-left: 1.5em; }
  & li { margin: 0.15em 0; }

  & pre {
    background: ${props => props.theme.palette.action.hover};
    padding: 0.5em;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.9em;
  }
  & code {
    background: ${props => props.theme.palette.action.hover};
    padding: 0.1em 0.3em;
    border-radius: 2px;
    font-size: 0.9em;
  }
  & pre code { background: none; padding: 0; }

  & blockquote {
    border-left: 3px solid ${props => props.theme.palette.divider};
    margin: 0.3em 0;
    padding: 0.3em 0.8em;
    color: ${props => props.theme.palette.text.secondary};
  }

  & a { color: ${props => props.theme.palette.primary.main}; }

  & table {
    border-collapse: collapse;
    margin: 0.3em 0;
  }
  & td, & th {
    border: 1px solid ${props => props.theme.palette.divider};
    padding: 0.25em 0.5em;
  }
`;

const FallbackText = styled(Typography)`
  white-space: pre-wrap;
`;

/**
 * WikiText renderer — renders agent output as wikitext via TiddlyWiki server.
 * Uses dangerouslySetInnerHTML for rendered HTML (content comes from trusted local TW server).
 * During streaming, shows raw text with reduced opacity; renders on completion.
 */
export const WikitextMessageRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const isStreaming = useAgentChatStore(state => state.isMessageStreaming(message.id));
  const content = message.content || '';

  // During streaming, only render content up to the last double-newline boundary (complete blocks)
  // This avoids sending half-formed wikitext to the renderer
  const contentToRender = useMemo(() => {
    if (!isStreaming) return content;
    const lastBoundary = content.lastIndexOf('\n\n');
    return lastBoundary > 0 ? content.slice(0, lastBoundary) : '';
  }, [content, isStreaming]);

  // Remaining unrendered text during streaming (shown as plain text with lower opacity)
  const trailingText = useMemo(() => {
    if (!isStreaming) return '';
    const lastBoundary = content.lastIndexOf('\n\n');
    return lastBoundary > 0 ? content.slice(lastBoundary) : content;
  }, [content, isStreaming]);

  // Use the existing wikitext rendering hook which handles workspace resolution
  const renderedHtml = useRenderWikiText(contentToRender);

  // If we have rendered HTML, show it; otherwise fall back to plain text
  const hasRenderedContent = renderedHtml.length > 0;

  return (
    <WikitextWrapper $isStreaming={isStreaming}>
      {hasRenderedContent
        ? <Box dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        : <FallbackText variant='body1'>{contentToRender}</FallbackText>}
      {trailingText && <FallbackText variant='body1' sx={{ opacity: 0.6 }}>{trailingText}</FallbackText>}
    </WikitextWrapper>
  );
});

WikitextMessageRenderer.displayName = 'WikitextMessageRenderer';
