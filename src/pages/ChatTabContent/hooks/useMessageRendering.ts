// Message rendering hooks

import { useEffect } from 'react';
import { BaseMessageRenderer } from '../components/MessageRenderer/BaseMessageRenderer';
import { ErrorMessageRenderer } from '../components/MessageRenderer/ErrorMessageRenderer';
import { registerMessageRenderer } from '../components/MessageRenderer/index';
import { ThinkingMessageRenderer } from '../components/MessageRenderer/ThinkingMessageRenderer';

/**
 * Hook to register all message renderers
 */
export const useRegisterMessageRenderers = (): void => {
  useEffect(() => {
    // Register thinking content renderer for various thinking tag formats
    registerMessageRenderer('thinking', {
      // High priority pattern to match all thinking tag formats
      pattern: /<(thinking|think|reasoning|reflection|reflect|internal-monologue|thought-process)>[\s\S]*?<\/\1>|<\|思考\|>[\s\S]*?<\/\|思考\|>|<(理性思考)>[\s\S]*?<\/\2>/i,
      renderer: ThinkingMessageRenderer,
      priority: 100, // Very high priority
    });

    // Register content type specific renderers
    registerMessageRenderer('markdown', {
      contentType: 'text/markdown',
      renderer: BaseMessageRenderer, // Replace with MarkdownRenderer when implemented
      priority: 50,
    });

    registerMessageRenderer('wikitext', {
      contentType: 'text/vnd.tiddlywiki',
      renderer: BaseMessageRenderer, // Replace with WikiTextRenderer when implemented
      priority: 50,
    });

    registerMessageRenderer('html', {
      contentType: 'text/html',
      renderer: BaseMessageRenderer, // Replace with HTMLRenderer when implemented
      priority: 50,
    });

    // Register error message renderer with higher priority than other renderers
    registerMessageRenderer('error', {
      // Custom renderer for error messages with errorDetail metadata
      renderer: ErrorMessageRenderer,
      // Match error messages by content
      pattern: /^Error:/,
      priority: 200, // Very high priority to override all other renderers for error messages
    });

    // Additional renderers can be registered here

    // No cleanup needed - registration is global
  }, []);
};
