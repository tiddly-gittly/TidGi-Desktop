// Message rendering registration — runs at module load time so renderers
// are available BEFORE the first React render cycle (no useEffect delay).

import { AskQuestionRenderer } from '../components/MessageRenderer/AskQuestionRenderer';
import { BaseMessageRenderer } from '../components/MessageRenderer/BaseMessageRenderer';
import { EditDiffRenderer } from '../components/MessageRenderer/EditDiffRenderer';
import { ErrorMessageRenderer } from '../components/MessageRenderer/ErrorMessageRenderer';
import { registerMessageRenderer } from '../components/MessageRenderer/index';
import { ThinkingMessageRenderer } from '../components/MessageRenderer/ThinkingMessageRenderer';
import { TodoListRenderer } from '../components/MessageRenderer/TodoListRenderer';
import { ToolApprovalRenderer } from '../components/MessageRenderer/ToolApprovalRenderer';
import { ToolResultRenderer } from '../components/MessageRenderer/ToolResultRenderer';
import { WikitextMessageRenderer } from '../components/MessageRenderer/WikitextMessageRenderer';

// Register all renderers eagerly at import time
registerMessageRenderer('thinking', {
  pattern: /<(thinking|think|reasoning|reflection|reflect|internal-monologue|thought-process)>[\s\S]*?<\/\1>|<\|思考\|>[\s\S]*?<\/\|思考\|>|<(理性思考)>[\s\S]*?<\/\2>/i,
  renderer: ThinkingMessageRenderer,
  priority: 100,
});

registerMessageRenderer('error', {
  renderer: ErrorMessageRenderer,
  pattern: /^Error:/,
  priority: 200,
});

registerMessageRenderer('ask-question', {
  pattern: /"type"\s*:\s*"ask-question"/,
  renderer: AskQuestionRenderer,
  priority: 150,
});

registerMessageRenderer('tool-approval', {
  pattern: /"type"\s*:\s*"tool-approval"/,
  renderer: ToolApprovalRenderer,
  priority: 150,
});

registerMessageRenderer('edit-diff', {
  pattern: /"type"\s*:\s*"edit-tiddler-diff"/,
  renderer: EditDiffRenderer,
  priority: 150,
});

registerMessageRenderer('todo-list', {
  pattern: /"type"\s*:\s*"todo-update"/,
  renderer: TodoListRenderer,
  priority: 150,
});

registerMessageRenderer('wikitext', {
  contentType: 'text/vnd.tiddlywiki',
  renderer: WikitextMessageRenderer,
  priority: 50,
});

registerMessageRenderer('markdown', {
  contentType: 'text/markdown',
  renderer: BaseMessageRenderer,
  priority: 50,
});

registerMessageRenderer('html', {
  contentType: 'text/html',
  renderer: BaseMessageRenderer,
  priority: 50,
});

registerMessageRenderer('tool-result', {
  pattern: /<functions_result>/,
  renderer: ToolResultRenderer,
  priority: 10,
});

/**
 * No-op hook kept for backward compatibility.
 * Registration now happens at module load time above.
 */
export const useRegisterMessageRenderers = (): void => {
  // Intentionally empty — registration moved to module scope
};
