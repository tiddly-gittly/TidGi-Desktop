// Message rendering hooks

import { useEffect } from 'react';
import { AskQuestionRenderer } from '../components/MessageRenderer/AskQuestionRenderer';
import { BaseMessageRenderer } from '../components/MessageRenderer/BaseMessageRenderer';
import { EditDiffRenderer } from '../components/MessageRenderer/EditDiffRenderer';
import { ErrorMessageRenderer } from '../components/MessageRenderer/ErrorMessageRenderer';
import { registerMessageRenderer } from '../components/MessageRenderer/index';
import { ThinkingMessageRenderer } from '../components/MessageRenderer/ThinkingMessageRenderer';
import { TodoListRenderer } from '../components/MessageRenderer/TodoListRenderer';
import { ToolApprovalRenderer } from '../components/MessageRenderer/ToolApprovalRenderer';
import { WikitextMessageRenderer } from '../components/MessageRenderer/WikitextMessageRenderer';

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

    // Register error message renderer with higher priority than other renderers
    registerMessageRenderer('error', {
      renderer: ErrorMessageRenderer,
      pattern: /^Error:/,
      priority: 200,
    });

    // Register ask-question tool result renderer
    registerMessageRenderer('ask-question', {
      pattern: /"type"\s*:\s*"ask-question"/,
      renderer: AskQuestionRenderer,
      priority: 150,
    });

    // Register tool-approval renderer
    registerMessageRenderer('tool-approval', {
      pattern: /"type"\s*:\s*"tool-approval"/,
      renderer: ToolApprovalRenderer,
      priority: 150,
    });

    // Register edit-tiddler diff renderer
    registerMessageRenderer('edit-diff', {
      pattern: /"type"\s*:\s*"edit-tiddler-diff"/,
      renderer: EditDiffRenderer,
      priority: 150,
    });

    // Register todo list renderer
    registerMessageRenderer('todo-list', {
      pattern: /"type"\s*:\s*"todo-update"/,
      renderer: TodoListRenderer,
      priority: 150,
    });

    // Register wikitext content type renderer
    registerMessageRenderer('wikitext', {
      contentType: 'text/vnd.tiddlywiki',
      renderer: WikitextMessageRenderer,
      priority: 50,
    });

    // Register content type specific renderers
    registerMessageRenderer('markdown', {
      contentType: 'text/markdown',
      renderer: BaseMessageRenderer, // Replace with MarkdownRenderer when implemented
      priority: 50,
    });

    registerMessageRenderer('html', {
      contentType: 'text/html',
      renderer: BaseMessageRenderer, // Replace with HTMLRenderer when implemented
      priority: 50,
    });

    // No cleanup needed - registration is global
  }, []);
};
