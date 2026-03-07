/**
 * Edit Tiddler Tool — VS Code-style range replacement for tiddler text.
 * Returns a unified diff summary with +/- line counts for UI rendering.
 *
 * Unlike wikiOperation.setTiddlerText which replaces the entire text,
 * this tool performs surgical line-range replacements, so the agent can
 * edit a single section without rewriting the whole tiddler.
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

export const EditTiddlerParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
}).meta({ title: 'Edit Tiddler Tool Config', description: 'Configuration for the tiddler range-edit tool' });

export type EditTiddlerParameter = z.infer<typeof EditTiddlerParameterSchema>;

const EditTiddlerToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace', description: 'Wiki workspace name or ID' }),
  title: z.string().meta({ title: 'Tiddler title', description: 'Title of the tiddler to edit' }),
  oldString: z.string().meta({
    title: 'Old string',
    description:
      'The exact literal substring in the tiddler text to replace. Must uniquely identify the location — include 2-3 lines of surrounding context if the target text is not unique. If the tiddler does not contain this exact substring the call will fail.',
  }),
  newString: z.string().meta({
    title: 'New string',
    description: 'The replacement text. Provide the EXACT text including whitespace and indentation. Pass an empty string to delete the matched range.',
  }),
}).meta({
  title: 'edit-tiddler',
  description: "Replace a unique substring inside an existing tiddler, like VS Code's replace_string_in_file. " +
    'Include enough surrounding context in oldString so it matches exactly ONE location. ' +
    'The tool returns a unified diff summary with +/- line counts.',
  examples: [
    {
      workspaceName: 'My Wiki',
      title: 'Meeting Notes',
      oldString: '* Action item: TBD',
      newString: '* Action item: Prepare Q3 report by Friday\n* Action item: Review PR #42',
    },
  ],
});

type EditTiddlerParameters = z.infer<typeof EditTiddlerToolSchema>;

/**
 * Compute a minimal unified-diff-like summary between old and new text.
 * Returns { linesAdded, linesRemoved, diffSummary }.
 */
function computeDiffSummary(oldText: string, _newText: string, oldString: string, newString: string): {
  linesAdded: number;
  linesRemoved: number;
  diffSummary: string;
} {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');

  const linesRemoved = oldLines.length;
  const linesAdded = newLines.length;

  // Build a human-readable unified diff snippet
  const diffParts: string[] = [];
  // Find approximate line number of the match in the original text
  const beforeMatch = oldText.slice(0, oldText.indexOf(oldString));
  const startLine = beforeMatch.split('\n').length;
  diffParts.push(`@@ -${startLine},${linesRemoved} +${startLine},${linesAdded} @@`);
  for (const line of oldLines) {
    diffParts.push(`- ${line}`);
  }
  for (const line of newLines) {
    diffParts.push(`+ ${line}`);
  }

  return { linesAdded, linesRemoved, diffSummary: diffParts.join('\n') };
}

async function executeEditTiddler(parameters: EditTiddlerParameters): Promise<ToolExecutionResult> {
  const { workspaceName, title, oldString, newString } = parameters;

  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

  // Resolve workspace
  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found. Available: ${workspaces.map(w => w.name).join(', ')}` };
  }

  // Read current text
  const currentText = await wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, target.id, [title]) as string | undefined;
  if (currentText === undefined || currentText === null) {
    return { success: false, error: `Tiddler "${title}" does not exist in workspace "${workspaceName}". Use wiki-operation addTiddler to create it first.` };
  }

  // Validate uniqueness of oldString
  const firstIndex = currentText.indexOf(oldString);
  if (firstIndex === -1) {
    // Provide a helpful snippet so the agent can retry
    const snippet = currentText.length > 500 ? `${currentText.slice(0, 500)}…` : currentText;
    return {
      success: false,
      error: `oldString not found in tiddler "${title}". Current content (first 500 chars):\n${snippet}`,
    };
  }
  const secondIndex = currentText.indexOf(oldString, firstIndex + 1);
  if (secondIndex !== -1) {
    return {
      success: false,
      error: `oldString matches multiple locations in "${title}". Include more surrounding context to make it unique.`,
    };
  }

  // Apply replacement
  const newText = currentText.slice(0, firstIndex) + newString + currentText.slice(firstIndex + oldString.length);
  await wikiService.wikiOperationInServer(WikiChannel.setTiddlerText, target.id, [title, newText]);

  // Compute diff info
  const { linesAdded, linesRemoved, diffSummary } = computeDiffSummary(currentText, newText, oldString, newString);
  logger.debug('editTiddler applied', { title, linesAdded, linesRemoved });

  const resultData = JSON.stringify({
    type: 'edit-tiddler-diff',
    title,
    workspaceName,
    linesAdded,
    linesRemoved,
    diffSummary,
  });

  return {
    success: true,
    data: resultData,
    metadata: { workspaceName, title, linesAdded, linesRemoved },
  };
}

const editTiddlerDefinition = registerToolDefinition({
  toolId: 'editTiddler',
  displayName: 'Edit Tiddler (Range Replace)',
  description: 'Replace a unique substring inside a tiddler — returns a diff with +/- counts',
  configSchema: EditTiddlerParameterSchema,
  llmToolSchemas: { 'edit-tiddler': EditTiddlerToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'edit-tiddler') return;
    if (agentFrameworkContext.isCancelled()) return;
    await executeToolCall('edit-tiddler', executeEditTiddler);
  },
});

export const editTiddlerTool = editTiddlerDefinition.tool;
