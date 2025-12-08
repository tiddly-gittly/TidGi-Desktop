/**
 * TiddlyWiki Plugin Tool
 *
 * Per https://github.com/TiddlyWiki/TiddlyWiki5/issues/9378, this tool helps AI understand and use available wiki functionality.
 *
 * Design:
 * - Configuration (TiddlyWikiPluginParameterSchema): Specifies workspaceID and the three tag names for flexibility
 * - Tool execution (TiddlyWikiPluginToolSchema): Provides two capabilities:
 *   1. Auto-loaded Describe tags (shown in prompt prefix) - short descriptions of available functionality
 *   2. Optional plugin loading (via tool call) - AI can load DataSource/Actions for specific plugins by title
 *
 * AI Workflow:
 * 1. System prompt includes auto-loaded Describe entries (descriptions of what's available)
 * 2. AI decides if it needs more details, calls tiddlywiki-plugin tool with a plugin title to load:
 *    - DataSource: data and filtering logic for that plugin
 *    - Actions: the action tiddler implementation details
 * 3. AI then uses wiki-operation tool with invokeActionString operation, passing:
 *    - title: The action tiddler title (from the Actions description)
 *    - variables: JSON with variables needed by the action (from AI's reasoning)
 *
 * Flexibility: AI doesn't need to use this tool if it understands TiddlyWiki well enough to directly
 * call wikiOperation with custom tiddler titles and action implementations.
 */
import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

export const TiddlyWikiPluginParameterSchema = z.object({
  workspaceNameOrID: z.string().default('wiki').meta({
    title: t('Schema.TiddlyWikiPlugin.WorkspaceNameOrID.Title'),
    description: t('Schema.TiddlyWikiPlugin.WorkspaceNameOrID.Description'),
  }),
  dataSourceTag: z.string().default('$:/tags/AI/Prompt/DataSource').meta({
    title: t('Schema.TiddlyWikiPlugin.DataSourceTag.Title'),
    description: t('Schema.TiddlyWikiPlugin.DataSourceTag.Description'),
  }),
  describeTag: z.string().default('$:/tags/AI/Prompt/Describe').meta({
    title: t('Schema.TiddlyWikiPlugin.DescribeTag.Title'),
    description: t('Schema.TiddlyWikiPlugin.DescribeTag.Description'),
  }),
  actionsTag: z.string().default('$:/tags/AI/Prompt/Actions').meta({
    title: t('Schema.TiddlyWikiPlugin.ActionsTag.Title'),
    description: t('Schema.TiddlyWikiPlugin.ActionsTag.Description'),
  }),
  enableCache: z.boolean().default(true).meta({
    title: t('Schema.TiddlyWikiPlugin.EnableCache.Title'),
    description: t('Schema.TiddlyWikiPlugin.EnableCache.Description'),
  }),
  toolListPosition: z.object({
    targetId: z.string().meta({
      title: t('Schema.TiddlyWikiPlugin.ToolListPosition.TargetIdTitle'),
      description: t('Schema.TiddlyWikiPlugin.ToolListPosition.TargetId'),
    }),
    position: z.enum(['before', 'after', 'child']).default('child').meta({
      title: t('Schema.TiddlyWikiPlugin.ToolListPosition.PositionTitle'),
      description: t('Schema.TiddlyWikiPlugin.ToolListPosition.Position'),
    }),
  }).optional().meta({
    title: t('Schema.TiddlyWikiPlugin.ToolListPositionTitle'),
    description: t('Schema.TiddlyWikiPlugin.ToolListPosition'),
  }),
}).meta({
  title: t('Schema.TiddlyWikiPlugin.Title'),
  description: t('Schema.TiddlyWikiPlugin.Description'),
});

export type TiddlyWikiPluginParameter = z.infer<typeof TiddlyWikiPluginParameterSchema>;

export function getTiddlyWikiPluginParameterSchema() {
  return TiddlyWikiPluginParameterSchema;
}

const TiddlyWikiPluginToolSchema = z.object({
  pluginTitle: z.string().meta({
    title: t('Schema.TiddlyWikiPlugin.Tool.Parameters.pluginTitle.Title'),
    description: t('Schema.TiddlyWikiPlugin.Tool.Parameters.pluginTitle.Description'),
  }),
}).meta({
  title: 'tiddlywiki-plugin',
  description:
    'Load DataSource and Actions details for a specific plugin by title. Use DataSource to understand data/filters, use Actions to see what action tiddlers are available and how to call them with invokeActionString via wiki-operation tool.',
  examples: [
    { pluginTitle: 'Calendar' },
    { pluginTitle: 'Tasks' },
  ],
});

type TiddlyWikiPluginParameters = z.infer<typeof TiddlyWikiPluginToolSchema>;

/**
 * Cache for Describe entries to avoid repeated wiki queries
 * Key: workspaceID, Value: formatted describe content
 */
const describeCache = new Map<string, string>();

/**
 * Clear the describe cache for a specific workspace or all workspaces
 */
function clearDescribeCache(workspaceID?: string): void {
  if (workspaceID) {
    describeCache.delete(workspaceID);
    logger.debug('Cleared TiddlyWiki plugin describe cache', { workspaceID });
  } else {
    describeCache.clear();
    logger.debug('Cleared all TiddlyWiki plugin describe cache');
  }
}

async function executeTiddlyWikiPlugin(parameters: TiddlyWikiPluginParameters, config: TiddlyWikiPluginParameter): Promise<ToolExecutionResult> {
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);

  if (!parameters.pluginTitle) {
    throw new Error(i18n.t('Tool.TiddlyWikiPlugin.Error.PluginTitleRequired'));
  }

  // Resolve workspace name or ID to workspace ID
  const workspaces = await workspaceService.getWorkspacesAsList();
  const targetWorkspace = workspaces.find((ws) => ws.name === config.workspaceNameOrID || ws.id === config.workspaceNameOrID);
  if (!targetWorkspace || !isWikiWorkspace(targetWorkspace)) {
    throw new Error(i18n.t('Tool.TiddlyWikiPlugin.Error.WorkspaceNotFound', { workspaceNameOrID: config.workspaceNameOrID }));
  }
  const workspaceID = targetWorkspace.id;

  logger.debug('Loading plugin details', { workspaceID, pluginTitle: parameters.pluginTitle });

  // Fetch DataSource tiddlers matching the plugin title
  const dataSourceFilter = `[tag[${config.dataSourceTag}]search[${parameters.pluginTitle}]]`;
  const dataSources = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [dataSourceFilter]);

  // Fetch Actions tiddlers matching the plugin title
  const actionsFilter = `[tag[${config.actionsTag}]search[${parameters.pluginTitle}]]`;
  const actions = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [actionsFilter]);

  return {
    success: true,
    data: JSON.stringify({
      workspaceID,
      pluginTitle: parameters.pluginTitle,
      dataSources: (dataSources || []).map((tid: ITiddlerFields) => ({
        title: tid.title,
        text: tid.text,
        tags: tid.tags,
      })),
    }),
    metadata: { workspaceID, pluginTitle: parameters.pluginTitle, dataSourceCount: dataSources?.length || 0, actionCount: actions?.length || 0 },
  };
}

const tiddlyWikiPluginDefinition = registerToolDefinition({
  toolId: 'tiddlywikiPlugin',
  displayName: 'TiddlyWiki Plugin',
  description: 'Load plugin details by title (DataSource and Actions). Describe tags auto-load in system prompt.',
  configSchema: TiddlyWikiPluginParameterSchema,
  llmToolSchemas: {
    'tiddlywiki-plugin': TiddlyWikiPluginToolSchema,
  },

  onProcessPrompts: async ({ config, injectToolList, injectContent, toolConfig }) => {
    const toolListPosition = config.toolListPosition;
    if (!toolListPosition?.targetId) return;

    try {
      // Resolve workspace
      const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
      const workspaces = await workspaceService.getWorkspacesAsList();
      const targetWorkspace = workspaces.find((ws) => ws.name === config.workspaceNameOrID || ws.id === config.workspaceNameOrID);
      if (!targetWorkspace || !isWikiWorkspace(targetWorkspace)) {
        // If workspace not found, still inject tool but without content
        injectToolList({
          targetId: toolListPosition.targetId,
          position: toolListPosition.position || 'child',
          caption: `TiddlyWiki Plugins (workspace not found: ${config.workspaceNameOrID})`,
        });
        return;
      }

      const workspaceID = targetWorkspace.id;

      // Check cache first (if enabled)
      let describeContent = config.enableCache ? describeCache.get(workspaceID) : undefined;

      if (!describeContent) {
        // Load Describe entries from wiki
        const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
        const describeFilter = `[tag[${config.describeTag}]]`;
        const describes = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [describeFilter]);

        // Format Describe entries as content
        describeContent = (describes || [])
          .map((tid: ITiddlerFields) => {
            const title = tid.title || '(untitled)';
            const text = tid.text || '(no description)';
            return `## ${title}\n\n${text}`;
          })
          .join('\n\n---\n\n');

        // Cache the result if enabled
        if (config.enableCache && describeContent) {
          describeCache.set(workspaceID, describeContent);
        }

        logger.debug('TiddlyWiki plugin Describe entries loaded', {
          targetId: toolListPosition.targetId,
          workspaceID,
          describeCount: describes?.length || 0,
          cached: false,
          toolId: toolConfig.id,
        });
      } else {
        logger.debug('TiddlyWiki plugin Describe entries loaded from cache', {
          targetId: toolListPosition.targetId,
          workspaceID,
          cached: true,
          toolId: toolConfig.id,
        });
      }

      // Clear cache if disabled (user wants to refresh)
      if (!config.enableCache) {
        clearDescribeCache(workspaceID);
      }

      // Inject both tool list and content
      injectToolList({
        targetId: toolListPosition.targetId,
        position: toolListPosition.position || 'child',
        caption: 'Available TiddlyWiki Plugins',
      });

      if (describeContent) {
        injectContent({
          targetId: toolListPosition.targetId,
          position: toolListPosition.position || 'child',
          content: describeContent,
        });
      }
    } catch (error) {
      logger.error('Failed to load TiddlyWiki plugin Describe entries', { error, config });
      // Still inject tool even if loading fails
      injectToolList({
        targetId: toolListPosition.targetId,
        position: toolListPosition.position || 'child',
        caption: 'TiddlyWiki Plugins (loading error)',
      });
    }
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext, config }) {
    if (!toolCall || toolCall.toolId !== 'tiddlywiki-plugin') return;
    if (agentFrameworkContext.isCancelled()) return;

    // At this point, config should be available from the context
    const typedConfig = config as TiddlyWikiPluginParameter;
    await executeToolCall('tiddlywiki-plugin', (parameters) => executeTiddlyWikiPlugin(parameters, typedConfig));
  },
});

export const tiddlywikiPluginTool = tiddlyWikiPluginDefinition.tool;
