/**
 * Wiki Backlinks Tool — returns tiddlers that link to a given tiddler.
 * Uses TiddlyWiki's backlinks filter operator.
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

export const BacklinksParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
}).meta({ title: 'Backlinks Tool Config', description: 'Configuration for wiki backlinks tool' });

export type BacklinksParameter = z.infer<typeof BacklinksParameterSchema>;

const BacklinksToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace name', description: 'Wiki workspace name or ID' }),
  title: z.string().meta({ title: 'Tiddler title', description: 'The tiddler title to find backlinks for' }),
  limit: z.number().optional().default(20).meta({ title: 'Limit', description: 'Max results to return' }),
}).meta({
  title: 'wiki-backlinks',
  description: 'Find all tiddlers that contain links pointing to the specified tiddler (reverse links / backlinks).',
  examples: [{ workspaceName: 'My Wiki', title: 'JavaScript', limit: 20 }],
});

async function executeBacklinks(parameters: z.infer<typeof BacklinksToolSchema>): Promise<ToolExecutionResult> {
  const { workspaceName, title, limit = 20 } = parameters;
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found. Available: ${workspaces.map(w => w.name).join(', ')}` };
  }

  const filter = `[all[]] +[backlinks[${title}]] +[limit[${limit}]]`;
  const results = await wikiService.wikiOperationInServer(WikiChannel.runFilter, target.id, [filter]);
  logger.debug('Backlinks executed', { title, count: results.length });

  if (results.length === 0) {
    return { success: true, data: `No backlinks found for "${title}" in workspace "${workspaceName}".` };
  }

  return {
    success: true,
    data: `Found ${results.length} backlink(s) for "${title}":\n${results.map(t => `- [[${t}]]`).join('\n')}`,
    metadata: { workspaceName, title, count: results.length },
  };
}

const backlinksDefinition = registerToolDefinition({
  toolId: 'backlinks',
  displayName: 'Wiki Backlinks',
  description: 'Find tiddlers that link to a given tiddler',
  configSchema: BacklinksParameterSchema,
  llmToolSchemas: { 'wiki-backlinks': BacklinksToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'wiki-backlinks') return;
    if (agentFrameworkContext.isCancelled()) return;
    await executeToolCall('wiki-backlinks', executeBacklinks);
  },
});

export const backlinksTool = backlinksDefinition.tool;
