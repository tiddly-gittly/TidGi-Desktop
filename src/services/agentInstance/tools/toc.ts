/**
 * Wiki TOC (Table of Contents / Tag Tree) Tool
 * Returns the tag tree hierarchy for a given tiddler using TiddlyWiki's tagging/in-tagtree-of filter.
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

export const TocParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
}).meta({ title: 'TOC Tool Config', description: 'Configuration for wiki tag tree / TOC tool' });

export type TocParameter = z.infer<typeof TocParameterSchema>;

const TocToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace name', description: 'Wiki workspace name or ID' }),
  rootTitle: z.string().meta({ title: 'Root tiddler', description: 'The root tiddler whose tag tree to retrieve' }),
  depth: z.number().optional().default(3).meta({ title: 'Max depth', description: 'Maximum depth of the tag tree to traverse' }),
}).meta({
  title: 'wiki-toc',
  description: 'Get the tag tree (table of contents) rooted at a tiddler. Returns all tiddlers tagged with the root, and their children, up to the specified depth.',
  examples: [{ workspaceName: 'My Wiki', rootTitle: 'Contents', depth: 3 }],
});

async function executeToc(parameters: z.infer<typeof TocToolSchema>): Promise<ToolExecutionResult> {
  const { workspaceName, rootTitle, depth = 3 } = parameters;
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found. Available: ${workspaces.map(w => w.name).join(', ')}` };
  }

  // Build tree recursively up to depth using tagging filter
  async function buildTree(title: string, currentDepth: number, indent: string): Promise<string[]> {
    if (currentDepth > depth) return [];
    const filter = `[all[shadows+tiddlers]tagging[${title}]!has[draft.of]sort[title]]`;
    const children = await wikiService.wikiOperationInServer(WikiChannel.runFilter, target!.id, [filter]);
    const lines: string[] = [];
    for (const child of children) {
      lines.push(`${indent}- [[${child}]]`);
      if (currentDepth < depth) {
        const subLines = await buildTree(child, currentDepth + 1, indent + '  ');
        lines.push(...subLines);
      }
    }
    return lines;
  }

  const treeLines = await buildTree(rootTitle, 1, '');
  logger.debug('TOC executed', { rootTitle, depth, lineCount: treeLines.length });

  if (treeLines.length === 0) {
    return { success: true, data: `No tagged children found under "${rootTitle}" in workspace "${workspaceName}".` };
  }

  return {
    success: true,
    data: `Tag tree for "${rootTitle}" (depth ${depth}):\n${treeLines.join('\n')}`,
    metadata: { workspaceName, rootTitle, depth, count: treeLines.length },
  };
}

const tocDefinition = registerToolDefinition({
  toolId: 'toc',
  displayName: 'Wiki TOC / Tag Tree',
  description: 'Get the hierarchical tag tree (table of contents) rooted at a tiddler',
  configSchema: TocParameterSchema,
  llmToolSchemas: { 'wiki-toc': TocToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'wiki-toc') return;
    if (agentFrameworkContext.isCancelled()) return;
    await executeToolCall('wiki-toc', executeToc);
  },
});

export const tocTool = tocDefinition.tool;
