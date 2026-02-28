/**
 * Todo Tool — lets the agent create and manage a structured todo list persisted
 * as a wiki tiddler.  The tiddler lives at `$:/ai/todo/<agentId>` so each
 * session gets its own list.
 *
 * Format inside the tiddler is plain-text checkbox markdown, which the agent
 * edits directly:
 *
 *   - [x] Research the topic
 *     - [x] Read paper A
 *   - [ ] Write summary
 *   - [ ] Review with user
 *
 * The tool provides two operations:
 *   • `write`  — overwrite the entire todo tiddler (the agent is responsible
 *                for maintaining the format; the prompt reminds it how)
 *   • `read`   — return the current todo text so the agent can review it
 *
 * On every prompt-concat round the current todo text is automatically injected
 * into the prompt tree so the agent always sees its latest plan.
 */
import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

/* ------------------------------------------------------------------ */
/*  Config schema                                                      */
/* ------------------------------------------------------------------ */

export const TodoParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  /** Prompt-tree node ID where the live todo content is injected each round */
  todoInjectionTargetId: z.string().optional().default('default-auto-continue').meta({
    title: 'Todo injection target',
    description: 'Prompt ID before which the current todo content is injected every round',
  }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
}).meta({ title: 'Todo Tool Config', description: 'Configuration for the AI todo list tool' });

export type TodoParameter = z.infer<typeof TodoParameterSchema>;

/* ------------------------------------------------------------------ */
/*  LLM-callable tool schemas                                          */
/* ------------------------------------------------------------------ */

const TodoToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace', description: 'Wiki workspace name or ID' }),
  operation: z.enum(['write', 'read']).meta({
    title: 'Operation',
    description: 'write — overwrite the full todo list text.  read — return the current text.',
  }),
  text: z.string().optional().meta({
    title: 'Todo text',
    description: 'The full todo list text (required for "write"). ' +
      'Use this exact format — one item per line, indent children with two spaces:\n' +
      '- [ ] Incomplete task\n' +
      '- [x] Completed task\n' +
      '  - [ ] Sub-task (indented 2 spaces)\n' +
      '    - [x] Nested sub-task (indented 4 spaces)\n' +
      'Keep the list concise. Each line MUST start with "- [ ] " or "- [x] " (with appropriate leading spaces for nesting).',
  }),
}).meta({
  title: 'manage-todo',
  description: 'Create or update a persistent todo / plan list for this session. ' +
    'Use "write" to save a new version of the whole list, and "read" to review the current list. ' +
    'The todo list is automatically included in every subsequent prompt so you always see your plan. ' +
    'Keep the list up-to-date: mark items [x] when done, add new items as discovered. ' +
    'Use hierarchy (indentation) to break complex tasks into sub-tasks.',
  examples: [
    {
      workspaceName: 'My Wiki',
      operation: 'write',
      text: '- [x] Research the topic\n  - [x] Read paper A\n  - [x] Read paper B\n- [ ] Write summary\n- [ ] Review with user',
    },
    { workspaceName: 'My Wiki', operation: 'read' },
  ],
});

type TodoToolParameters = z.infer<typeof TodoToolSchema>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive the tiddler title from the agent instance ID */
function todoTiddlerTitle(agentId: string): string {
  return `$:/ai/todo/${agentId}`;
}

async function resolveWorkspace(workspaceName: string) {
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const list = await workspaceService.getWorkspacesAsList();
  return list.find(ws => ws.name === workspaceName || ws.id === workspaceName);
}

/* ------------------------------------------------------------------ */
/*  Executor                                                           */
/* ------------------------------------------------------------------ */

async function executeTodo(parameters: TodoToolParameters, agentId: string): Promise<ToolExecutionResult> {
  const { workspaceName, operation, text } = parameters;
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const target = await resolveWorkspace(workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found.` };
  }

  const tiddlerTitle = todoTiddlerTitle(agentId);

  if (operation === 'read') {
    const current = await wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, target.id, [tiddlerTitle]) as string | undefined;
    if (!current) {
      return { success: true, data: '(No todo list exists yet for this session.)' };
    }
    return { success: true, data: current };
  }

  // operation === 'write'
  if (text === undefined || text === null) {
    return { success: false, error: '"text" is required for the write operation.' };
  }

  // Upsert the tiddler (addTiddler creates or overwrites)
  await wikiService.wikiOperationInServer(WikiChannel.addTiddler, target.id, [
    tiddlerTitle,
    text,
    JSON.stringify({ type: 'text/vnd.tiddlywiki', tags: '$:/tags/AI/Todo' }),
    JSON.stringify({ withDate: true }),
  ]);

  // Return structured JSON so the TodoListRenderer can render it
  const resultData = JSON.stringify({
    type: 'todo-update',
    tiddlerTitle,
    text,
    itemCount: (text.match(/^[\t ]*- \[[ x]\]/gm) ?? []).length,
    completedCount: (text.match(/^[\t ]*- \[x\]/gm) ?? []).length,
  });

  logger.debug('Todo list updated', { agentId, tiddlerTitle, length: text.length });
  return { success: true, data: resultData, metadata: { tiddlerTitle } };
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

const todoDefinition = registerToolDefinition({
  toolId: 'todo',
  displayName: 'Todo / Plan List',
  description: 'Persistent todo list that the agent uses to track progress — auto-injected into every prompt',
  configSchema: TodoParameterSchema,
  llmToolSchemas: { 'manage-todo': TodoToolSchema },

  onProcessPrompts({ config, injectToolList, injectContent, agentFrameworkContext }) {
    // 1. Inject tool description into the tool list area
    const pos = config.toolListPosition;
    if (pos?.targetId) {
      injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
    }

    // 2. Inject current todo text into the prompt tree so the agent always sees its plan
    const injectionTarget = config.todoInjectionTargetId ?? 'default-auto-continue';
    const agentId = agentFrameworkContext.agent.id;
    const tiddlerTitle = todoTiddlerTitle(agentId);

    // Read the todo tiddler synchronously from the last-known messages (avoid async in processPrompts)
    // We look for the most recent tool result that contains a todo-update JSON
    const messages = agentFrameworkContext.agent.messages;
    let latestTodoText: string | undefined;
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === 'tool' && message.content.includes('"type":"todo-update"')) {
        try {
          const match = /Result:\s*(.+?)\s*(?:<\/functions_result>|$)/s.exec(message.content);
          if (match) {
            const parsed = JSON.parse(match[1]) as { type: string; text?: string };
            if (parsed.type === 'todo-update' && parsed.text) {
              latestTodoText = parsed.text;
              break;
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (latestTodoText) {
      injectContent({
        targetId: injectionTarget,
        position: 'before',
        id: 'ai-todo-current',
        caption: 'Current Todo List',
        content: `<current_todo_list tiddler="${tiddlerTitle}">\n` +
          `${latestTodoText}\n` +
          '</current_todo_list>\n' +
          'The above is your current task plan. Keep it updated as you progress — mark completed items [x] and add new sub-tasks as needed.',
      });
    }
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'manage-todo') return;
    if (agentFrameworkContext.isCancelled()) return;

    const agentId = agentFrameworkContext.agent.id;
    await executeToolCall('manage-todo', async (parameters) => {
      return executeTodo(parameters, agentId);
    });
  },
});

export const todoTool = todoDefinition.tool;
