/**
 * Wiki Recent Tool — returns recently modified tiddlers.
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

export const RecentParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
}).meta({ title: 'Recent Tool Config', description: 'Configuration for wiki recent changes tool' });

export type RecentParameter = z.infer<typeof RecentParameterSchema>;

const RecentToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace name', description: 'Wiki workspace name or ID' }),
  limit: z.number().optional().default(20).meta({ title: 'Limit', description: 'Max tiddlers to return' }),
  daysAgo: z.number().optional().meta({ title: 'Days ago', description: 'Only show tiddlers modified within this many days' }),
}).meta({
  title: 'wiki-recent',
  description: 'Get recently modified tiddlers, sorted by modification time (newest first).',
  examples: [{ workspaceName: 'My Wiki', limit: 20 }, { workspaceName: 'My Wiki', limit: 10, daysAgo: 7 }],
});

async function executeRecent(parameters: z.infer<typeof RecentToolSchema>): Promise<ToolExecutionResult> {
  const { workspaceName, limit = 20, daysAgo } = parameters;
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found. Available: ${workspaces.map(w => w.name).join(', ')}` };
  }

  let filter = `[!is[system]!has[draft.of]!sort[modified]limit[${limit}]]`;
  if (daysAgo) {
    filter = `[!is[system]!has[draft.of]days:modified[${daysAgo}]!sort[modified]limit[${limit}]]`;
  }

  const results = await wikiService.wikiOperationInServer(WikiChannel.runFilter, target.id, [filter]);
  logger.debug('Recent executed', { count: results.length, daysAgo });

  if (results.length === 0) {
    return { success: true, data: `No recently modified tiddlers found in workspace "${workspaceName}".` };
  }

  return {
    success: true,
    data: `Recently modified tiddlers in "${workspaceName}" (${results.length} results):\n${results.map((title, index) => `${index + 1}. [[${title}]]`).join('\n')}`,
    metadata: { workspaceName, count: results.length },
  };
}

const recentDefinition = registerToolDefinition({
  toolId: 'recent',
  displayName: 'Wiki Recent Changes',
  description: 'Get recently modified tiddlers sorted by modification time',
  configSchema: RecentParameterSchema,
  llmToolSchemas: { 'wiki-recent': RecentToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'wiki-recent') return;
    if (agentFrameworkContext.isCancelled()) return;
    await executeToolCall('wiki-recent', executeRecent);
  },
});

export const recentTool = recentDefinition.tool;
