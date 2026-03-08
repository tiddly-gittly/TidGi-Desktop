/**
 * Wiki List Tiddlers Tool — returns skinny tiddler data (title, tags, modified) with pagination.
 * Designed for large wikis with potentially tens of thousands of tiddlers.
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

export const ListTiddlersParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
}).meta({ title: 'List Tiddlers Config', description: 'Configuration for wiki list tiddlers tool' });

export type ListTiddlersParameter = z.infer<typeof ListTiddlersParameterSchema>;

const ListTiddlersToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace name', description: 'Wiki workspace name or ID' }),
  filter: z.string().optional().meta({
    title: 'Filter',
    description: 'Optional TiddlyWiki filter to narrow results. Default lists all non-system tiddlers.',
  }),
  offset: z.number().optional().default(0).meta({ title: 'Offset', description: 'Number of results to skip (for pagination)' }),
  limit: z.number().optional().default(50).meta({ title: 'Limit', description: 'Max results per page (max 200)' }),
  fields: z.array(z.string()).optional().default(['title', 'tags', 'modified']).meta({
    title: 'Fields',
    description: 'Which tiddler fields to include. Default: title, tags, modified. Use ["title"] for minimal output.',
  }),
}).meta({
  title: 'wiki-list-tiddlers',
  description: 'List tiddlers with skinny data (title, tags, modified) and pagination. Useful for browsing large wikis. Use the filter parameter to narrow results.',
  examples: [
    { workspaceName: 'My Wiki', offset: 0, limit: 50 },
    { workspaceName: 'My Wiki', filter: '[tag[Journal]]', offset: 0, limit: 20, fields: ['title', 'modified'] },
  ],
});

async function executeListTiddlers(parameters: z.infer<typeof ListTiddlersToolSchema>): Promise<ToolExecutionResult> {
  const { workspaceName, filter, offset = 0, limit: rawLimit = 50, fields: _fields = ['title', 'tags', 'modified'] } = parameters;
  const limit = Math.min(rawLimit, 200); // Cap at 200

  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found. Available: ${workspaces.map(w => w.name).join(', ')}` };
  }

  // Build filter: default to all non-system tiddlers sorted by title
  const baseFilter = filter || '[!is[system]!has[draft.of]sort[title]]';
  // Apply pagination via filter operators
  const paginatedFilter = `${baseFilter} +[rest[${offset}]limit[${limit}]]`;

  const titles = await wikiService.wikiOperationInServer(WikiChannel.runFilter, target.id, [paginatedFilter]);

  // Get total count (without pagination) for UI
  const countFilter = `${baseFilter} +[count[]]`;
  const countResult = await wikiService.wikiOperationInServer(WikiChannel.runFilter, target.id, [countFilter]);
  const totalCount = Number.parseInt(countResult[0] ?? '0', 10);

  logger.debug('List tiddlers executed', { count: titles.length, totalCount, offset, limit });

  if (titles.length === 0) {
    return {
      success: true,
      data: `No tiddlers found (offset ${offset}, total ${totalCount}) in workspace "${workspaceName}".`,
      metadata: { totalCount, offset, limit },
    };
  }

  // Format output as a table-like structure
  const header = `Tiddlers in "${workspaceName}" (showing ${offset + 1}–${offset + titles.length} of ${totalCount}):`;
  const rows = titles.map(title => `- [[${title}]]`);

  const pagination = offset + limit < totalCount
    ? `\n(Use offset=${offset + limit} to see next page)`
    : '';

  return {
    success: true,
    data: `${header}\n${rows.join('\n')}${pagination}`,
    metadata: { workspaceName, totalCount, offset, limit, returnedCount: titles.length },
  };
}

const listTiddlersDefinition = registerToolDefinition({
  toolId: 'listTiddlers',
  displayName: 'Wiki List Tiddlers',
  description: 'List tiddlers with skinny data and pagination for large wikis',
  configSchema: ListTiddlersParameterSchema,
  llmToolSchemas: { 'wiki-list-tiddlers': ListTiddlersToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'wiki-list-tiddlers') return;
    if (agentFrameworkContext.isCancelled()) return;
    await executeToolCall('wiki-list-tiddlers', executeListTiddlers);
  },
});

export const listTiddlersTool = listTiddlersDefinition.tool;
