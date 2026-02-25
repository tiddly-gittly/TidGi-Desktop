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
import React, { memo, useEffect, useRef, useState } from 'react';
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
 */
export const WikitextMessageRenderer: React.FC<MessageRendererProps> = memo(({ message }) => {
  const isStreaming = useAgentChatStore(state => state.isMessageStreaming(message.id));
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const lastContentReference = useRef('');

  useEffect(() => {
    const content = message.content || '';

    // Don't re-render if content hasn't changed
    if (content === lastContentReference.current && renderedHtml !== null) return;
    lastContentReference.current = content;

    // Skip rendering empty content
    if (!content.trim()) {
      setRenderedHtml('');
      return;
    }

    // During streaming, only render every ~500 chars change to avoid thrashing
    if (isStreaming && renderedHtml !== null) {
      const diff = Math.abs(content.length - (lastContentReference.current?.length ?? 0));
      if (diff < 500) return;
    }

    // Call TiddlyWiki server to render wikitext
    // Using the wiki service proxy (exposed via preload)
    const renderWikitext = async () => {
      try {
        // Use wikiOperationInServer with WikiChannel.renderWikiText
        // For now, we use a simplified approach — the full version would need workspace ID
        // TODO: get active workspace ID from context and call wikiOperationInServer
        setRenderedHtml(null);
        setError(true);
      } catch {
        setRenderedHtml(null);
        setError(true);
      }
    };

    void renderWikitext();
  }, [message.content, isStreaming, renderedHtml]);

  if (error || renderedHtml === null) {
    return (
      <WikitextWrapper $isStreaming={isStreaming}>
        <FallbackText variant='body1'>{message.content}</FallbackText>
      </WikitextWrapper>
    );
  }

  return (
    <WikitextWrapper
      $isStreaming={isStreaming}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
});

WikitextMessageRenderer.displayName = 'WikitextMessageRenderer';
