/**
 * Wiki Search Tool
 * Handles wiki search tool list injection, tool calling detection and response processing
 */
import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiEmbeddingService } from '@services/wikiEmbedding/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';
import { z } from 'zod/v4';
import type { AiAPIConfig } from '../promptConcat/promptConcatSchema';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

/**
 * Wiki Search Config Schema (user-configurable in UI)
 */
export const WikiSearchParameterSchema = z.object({
  sourceType: z.enum(['wiki']).meta({
    title: t('Schema.WikiSearch.SourceTypeTitle'),
    description: t('Schema.WikiSearch.SourceType'),
  }),
  toolListPosition: z.object({
    targetId: z.string().meta({
      title: t('Schema.Common.ToolListPosition.TargetIdTitle'),
      description: t('Schema.Common.ToolListPosition.TargetId'),
    }),
    position: z.enum(['before', 'after']).meta({
      title: t('Schema.Common.ToolListPosition.PositionTitle'),
      description: t('Schema.Common.ToolListPosition.Position'),
    }),
  }).optional().meta({
    title: t('Schema.Common.ToolListPositionTitle'),
    description: t('Schema.Common.ToolListPosition.Description'),
  }),
  toolResultDuration: z.number().optional().default(1).meta({
    title: t('Schema.WikiSearch.ToolResultDurationTitle'),
    description: t('Schema.WikiSearch.ToolResultDuration'),
  }),
}).meta({
  title: t('Schema.WikiSearch.Title'),
  description: t('Schema.WikiSearch.Description'),
});

export type WikiSearchParameter = z.infer<typeof WikiSearchParameterSchema>;

export function getWikiSearchParameterSchema() {
  return WikiSearchParameterSchema;
}

/**
 * LLM-callable tool schema for wiki search
 */
const WikiSearchToolSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.WikiSearch.Tool.Parameters.workspaceName.Title'),
    description: t('Schema.WikiSearch.Tool.Parameters.workspaceName.Description'),
  }),
  searchType: z.enum(['filter', 'vector']).optional().default('filter').meta({
    title: t('Schema.WikiSearch.Tool.Parameters.searchType.Title'),
    description: t('Schema.WikiSearch.Tool.Parameters.searchType.Description'),
  }),
  filter: z.string().optional().meta({
    title: t('Schema.WikiSearch.Tool.Parameters.filter.Title'),
    description: t('Schema.WikiSearch.Tool.Parameters.filter.Description'),
  }),
  query: z.string().optional().meta({
    title: t('Schema.WikiSearch.Tool.Parameters.query.Title'),
    description: t('Schema.WikiSearch.Tool.Parameters.query.Description'),
  }),
  limit: z.number().optional().default(10).meta({
    title: t('Schema.WikiSearch.Tool.Parameters.limit.Title'),
    description: t('Schema.WikiSearch.Tool.Parameters.limit.Description'),
  }),
  threshold: z.number().optional().default(0.7).meta({
    title: t('Schema.WikiSearch.Tool.Parameters.threshold.Title'),
    description: t('Schema.WikiSearch.Tool.Parameters.threshold.Description'),
  }),
}).meta({
  title: 'wiki-search',
  description: t('Schema.WikiSearch.Tool.Description'),
  examples: [
    { workspaceName: '我的知识库', searchType: 'filter' as const, filter: '[tag[示例]]', limit: 10, threshold: 0.7 },
    { workspaceName: '我的知识库', searchType: 'vector' as const, query: '如何使用智能体', limit: 5, threshold: 0.7 },
  ],
});

type WikiSearchToolParameters = z.infer<typeof WikiSearchToolSchema>;

/**
 * LLM-callable tool schema for updating embeddings
 */
const WikiUpdateEmbeddingsToolSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.WikiSearch.Tool.UpdateEmbeddings.workspaceName.Title'),
    description: t('Schema.WikiSearch.Tool.UpdateEmbeddings.workspaceName.Description'),
  }),
  forceUpdate: z.boolean().optional().default(false).meta({
    title: t('Schema.WikiSearch.Tool.UpdateEmbeddings.forceUpdate.Title'),
    description: t('Schema.WikiSearch.Tool.UpdateEmbeddings.forceUpdate.Description'),
  }),
}).meta({
  title: 'wiki-update-embeddings',
  description: t('Schema.WikiSearch.Tool.UpdateEmbeddings.Description'),
  examples: [
    { workspaceName: '我的知识库', forceUpdate: false },
    { workspaceName: 'wiki', forceUpdate: true },
  ],
});

type WikiUpdateEmbeddingsToolParameters = z.infer<typeof WikiUpdateEmbeddingsToolSchema>;

/**
 * Execute wiki search
 */
async function executeWikiSearch(
  parameters: WikiSearchToolParameters,
  aiConfig?: AiAPIConfig,
): Promise<ToolExecutionResult> {
  const { workspaceName, searchType = 'filter', filter, query, limit = 10, threshold = 0.7 } = parameters;

  try {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

    // Look up workspace
    const workspaces = await workspaceService.getWorkspacesAsList();
    const targetWorkspace = workspaces.find((ws) => ws.name === workspaceName || ws.id === workspaceName);

    if (!targetWorkspace) {
      return {
        success: false,
        error: i18n.t('Tool.WikiSearch.Error.WorkspaceNotFound', {
          workspaceName,
          availableWorkspaces: workspaces.map((w) => `${w.name} (${w.id})`).join(', '),
        }),
      };
    }

    const workspaceID = targetWorkspace.id;

    if (!(await workspaceService.exists(workspaceID))) {
      return { success: false, error: i18n.t('Tool.WikiSearch.Error.WorkspaceNotExist', { workspaceID }) };
    }

    logger.debug('Executing wiki search', { workspaceID, workspaceName, searchType, filter, query });

    const results: Array<{ title: string; text?: string; fields?: ITiddlerFields; similarity?: number }> = [];
    let searchMetadata: Record<string, unknown> = { workspaceID, workspaceName, searchType };

    if (searchType === 'vector') {
      if (!query) {
        return { success: false, error: i18n.t('Tool.WikiSearch.Error.VectorSearchRequiresQuery') };
      }
      if (!aiConfig) {
        return { success: false, error: i18n.t('Tool.WikiSearch.Error.VectorSearchRequiresConfig') };
      }

      const wikiEmbeddingService = container.get<IWikiEmbeddingService>(serviceIdentifier.WikiEmbedding);

      try {
        const vectorResults = await wikiEmbeddingService.searchSimilar(workspaceID, query, aiConfig, limit, threshold);

        if (vectorResults.length === 0) {
          return {
            success: true,
            data: i18n.t('Tool.WikiSearch.Success.NoVectorResults', { query, workspaceName, threshold }),
            metadata: { ...searchMetadata, query, limit, threshold, resultCount: 0 },
          };
        }

        // Get full content for results
        for (const vr of vectorResults) {
          try {
            const tiddlerFields = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [vr.record.tiddlerTitle]);
            results.push({
              title: vr.record.tiddlerTitle,
              text: tiddlerFields[0]?.text,
              fields: tiddlerFields[0],
              similarity: vr.similarity,
            });
          } catch {
            results.push({ title: vr.record.tiddlerTitle, similarity: vr.similarity });
          }
        }

        searchMetadata = { ...searchMetadata, query, limit, threshold, resultCount: results.length };
      } catch (error) {
        return {
          success: false,
          error: i18n.t('Tool.WikiSearch.Error.VectorSearchFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    } else {
      // Filter search
      if (!filter) {
        return { success: false, error: i18n.t('Tool.WikiSearch.Error.FilterSearchRequiresFilter') };
      }

      const tiddlerTitles = await wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, [filter]);

      if (tiddlerTitles.length === 0) {
        return {
          success: true,
          data: i18n.t('Tool.WikiSearch.Success.NoResults', { filter, workspaceName }),
          metadata: { ...searchMetadata, filter, resultCount: 0 },
        };
      }

      for (const title of tiddlerTitles) {
        try {
          const tiddlerFields = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [title]);
          results.push({ title, text: tiddlerFields[0]?.text, fields: tiddlerFields[0] });
        } catch {
          results.push({ title });
        }
      }

      searchMetadata = { ...searchMetadata, filter, resultCount: results.length };
    }

    // Format results
    let content = searchType === 'vector'
      ? i18n.t('Tool.WikiSearch.Success.VectorCompleted', { totalResults: results.length, query })
      : i18n.t('Tool.WikiSearch.Success.Completed', { totalResults: results.length, shownResults: results.length }) + '\n\n';

    for (const result of results) {
      content += `**Tiddler: ${result.title}**`;
      if (result.similarity !== undefined) {
        content += ` (Similarity: ${(result.similarity * 100).toFixed(1)}%)`;
      }
      content += '\n\n';
      content += result.text ? `\`\`\`tiddlywiki\n${result.text}\n\`\`\`\n\n` : '(Content not available)\n\n';
    }

    return { success: true, data: content, metadata: searchMetadata };
  } catch (error) {
    logger.error('Wiki search failed', { error, params: parameters });
    return {
      success: false,
      error: i18n.t('Tool.WikiSearch.Error.ExecutionFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

/**
 * Execute wiki update embeddings
 */
async function executeWikiUpdateEmbeddings(
  parameters: WikiUpdateEmbeddingsToolParameters,
  aiConfig?: AiAPIConfig,
): Promise<ToolExecutionResult> {
  const { workspaceName, forceUpdate = false } = parameters;

  try {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiEmbeddingService = container.get<IWikiEmbeddingService>(serviceIdentifier.WikiEmbedding);

    const workspaces = await workspaceService.getWorkspacesAsList();
    const targetWorkspace = workspaces.find((ws) => ws.name === workspaceName || ws.id === workspaceName);

    if (!targetWorkspace) {
      return {
        success: false,
        error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.WorkspaceNotFound', {
          workspaceName,
          availableWorkspaces: workspaces.map((w) => `${w.name} (${w.id})`).join(', '),
        }),
      };
    }

    const workspaceID = targetWorkspace.id;

    if (!(await workspaceService.exists(workspaceID))) {
      return { success: false, error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.WorkspaceNotExist', { workspaceID }) };
    }

    if (!aiConfig) {
      return { success: false, error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.NoAIConfig') };
    }

    logger.debug('Executing wiki embedding generation', { workspaceID, workspaceName, forceUpdate });

    await wikiEmbeddingService.generateEmbeddings(workspaceID, aiConfig, forceUpdate);
    const stats = await wikiEmbeddingService.getEmbeddingStats(workspaceID);

    return {
      success: true,
      data: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Success.Generated', {
        workspaceName,
        totalEmbeddings: stats.totalEmbeddings,
        totalNotes: stats.totalNotes,
      }),
      metadata: { workspaceID, workspaceName, ...stats, forceUpdate },
    };
  } catch (error) {
    logger.error('Wiki update embeddings failed', { error, params: parameters });
    return {
      success: false,
      error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.ExecutionFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

/**
 * Wiki Search Tool Definition
 */
const wikiSearchDefinition = registerToolDefinition({
  toolId: 'wikiSearch',
  displayName: t('Schema.WikiSearch.Title'),
  description: t('Schema.WikiSearch.Description'),
  configSchema: WikiSearchParameterSchema,
  llmToolSchemas: {
    'wiki-search': WikiSearchToolSchema,
    'wiki-update-embeddings': WikiUpdateEmbeddingsToolSchema,
  },

  onProcessPrompts({ config, toolConfig, injectToolList }) {
    const toolListPosition = config.toolListPosition;
    if (!toolListPosition?.targetId) return;

    injectToolList({
      targetId: toolListPosition.targetId,
      position: toolListPosition.position || 'child',
      caption: 'Wiki search tool',
    });

    logger.debug('Wiki search tool list injected', {
      targetId: toolListPosition.targetId,
      position: toolListPosition.position,
      toolId: toolConfig.id,
    });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall) return;

    // Check cancellation
    if (agentFrameworkContext.isCancelled()) {
      logger.debug('Wiki search cancelled', { agentId: agentFrameworkContext.agent.id });
      return;
    }

    const aiConfig = agentFrameworkContext.agent.aiApiConfig as AiAPIConfig | undefined;

    if (toolCall.toolId === 'wiki-search') {
      await executeToolCall('wiki-search', (parameters) => executeWikiSearch(parameters, aiConfig));
    } else if (toolCall.toolId === 'wiki-update-embeddings') {
      await executeToolCall('wiki-update-embeddings', (parameters) => executeWikiUpdateEmbeddings(parameters, aiConfig));
    }
  },
});

export const wikiSearchTool = wikiSearchDefinition.tool;
