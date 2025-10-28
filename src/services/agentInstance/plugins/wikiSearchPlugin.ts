/**
 * Wiki Search plugin
 * Handles wiki search tool list injection, tool calling detection and response processing
 */
import { WikiChannel } from '@/constants/channels';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
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
import type { AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { findPromptById } from '../promptConcat/promptConcat';
import type { AiAPIConfig } from '../promptConcat/promptConcatSchema';
import type { IPrompt } from '../promptConcat/promptConcatSchema';
import { schemaToToolContent } from '../utilities/schemaToToolContent';
import type { AIResponseContext, PromptConcatPlugin } from './types';

/**
 * Wiki Search Parameter Schema
 * Configuration parameters for the wiki search plugin
 */
export const WikiSearchParameterSchema = z.object({
  position: z.enum(['relative', 'absolute', 'before', 'after']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
  }),
  targetId: z.string().meta({
    title: t('Schema.Position.TargetIdTitle'),
    description: t('Schema.Position.TargetId'),
  }),
  bottom: z.number().optional().meta({
    title: t('Schema.Position.BottomTitle'),
    description: t('Schema.Position.Bottom'),
  }),
  sourceType: z.enum(['wiki']).meta({
    title: t('Schema.WikiSearch.SourceTypeTitle'),
    description: t('Schema.WikiSearch.SourceType'),
  }),
  toolListPosition: z.object({
    targetId: z.string().meta({
      title: t('Schema.WikiSearch.ToolListPosition.TargetIdTitle'),
      description: t('Schema.WikiSearch.ToolListPosition.TargetId'),
    }),
    position: z.enum(['before', 'after']).meta({
      title: t('Schema.WikiSearch.ToolListPosition.PositionTitle'),
      description: t('Schema.WikiSearch.ToolListPosition.Position'),
    }),
  }).optional().meta({
    title: t('Schema.WikiSearch.ToolListPositionTitle'),
    description: t('Schema.WikiSearch.ToolListPosition'),
  }),
  toolResultDuration: z.number().optional().default(1).meta({
    title: t('Schema.WikiSearch.ToolResultDurationTitle'),
    description: t('Schema.WikiSearch.ToolResultDuration'),
  }),
}).meta({
  title: t('Schema.WikiSearch.Title'),
  description: t('Schema.WikiSearch.Description'),
});

/**
 * Type definition for wiki search parameters
 */
export type WikiSearchParameter = z.infer<typeof WikiSearchParameterSchema>;

/**
 * Get the wiki search parameter schema
 * @returns The schema for wiki search parameters
 */
export function getWikiSearchParameterSchema() {
  return WikiSearchParameterSchema;
}

/**
 * Parameter schema for Wiki search tool
 */
const WikiSearchToolParameterSchema = z.object({
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

type WikiSearchToolParameter = z.infer<typeof WikiSearchToolParameterSchema>;

/**
 * Parameter schema for Wiki update embeddings tool
 */
const WikiUpdateEmbeddingsToolParameterSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.WikiSearch.Tool.UpdateEmbeddings.workspaceName.Title'),
    description: t('Schema.WikiSearch.Tool.UpdateEmbeddings.workspaceName.Description'),
  }),
  forceUpdate: z.boolean().optional().default(false).meta({
    title: t('Schema.WikiSearch.Tool.UpdateEmbeddings.forceUpdate.Title'),
    description: t('Schema.WikiSearch.Tool.UpdateEmbeddings.forceUpdate.Description'),
  }),
})
  .meta({
    title: 'wiki-update-embeddings',
    description: t('Schema.WikiSearch.Tool.UpdateEmbeddings.Description'),
    examples: [
      { workspaceName: '我的知识库', forceUpdate: false },
      { workspaceName: 'wiki', forceUpdate: true },
    ],
  });

type WikiUpdateEmbeddingsToolParameter = z.infer<typeof WikiUpdateEmbeddingsToolParameterSchema>;

/**
 * Execute wiki search tool
 */
async function executeWikiSearchTool(
  parameters: WikiSearchToolParameter,
  context?: { agentId?: string; messageId?: string; config?: AiAPIConfig },
): Promise<{ success: boolean; data?: string; error?: string; metadata?: Record<string, unknown> }> {
  try {
    const { workspaceName, searchType = 'filter', filter, query, limit = 10, threshold = 0.7 } = parameters;

    // Get workspace service
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

    // Look up workspace ID from workspace name or ID
    const workspaces = await workspaceService.getWorkspacesAsList();
    const targetWorkspace = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);

    if (!targetWorkspace) {
      return {
        success: false,
        error: i18n.t('Tool.WikiSearch.Error.WorkspaceNotFound', {
          workspaceName,
          availableWorkspaces: workspaces.map(w => `${w.name} (${w.id})`).join(', '),
        }),
      };
    }

    const workspaceID = targetWorkspace.id;

    if (!await workspaceService.exists(workspaceID)) {
      return {
        success: false,
        error: i18n.t('Tool.WikiSearch.Error.WorkspaceNotExist', { workspaceID }),
      };
    }

    logger.debug('Executing wiki search', {
      workspaceID,
      workspaceName,
      searchType,
      filter,
      query,
      agentId: context?.agentId,
    });

    // Execute search based on type
    let results: Array<{ title: string; text?: string; fields?: ITiddlerFields; similarity?: number }> = [];
    let searchMetadata: Record<string, unknown> = {
      workspaceID,
      workspaceName,
      searchType,
    };

    if (searchType === 'vector') {
      // Vector search
      if (!query) {
        return {
          success: false,
          error: i18n.t('Tool.WikiSearch.Error.VectorSearchRequiresQuery'),
        };
      }

      if (!context?.config) {
        return {
          success: false,
          error: i18n.t('Tool.WikiSearch.Error.VectorSearchRequiresConfig'),
        };
      }

      const wikiEmbeddingService = container.get<IWikiEmbeddingService>(serviceIdentifier.WikiEmbedding);

      try {
        const vectorResults = await wikiEmbeddingService.searchSimilar(
          workspaceID,
          query,
          context.config,
          limit,
          threshold,
        );

        if (vectorResults.length === 0) {
          return {
            success: true,
            data: i18n.t('Tool.WikiSearch.Success.NoVectorResults', { query, workspaceName, threshold }),
            metadata: {
              ...searchMetadata,
              query,
              limit,
              threshold,
              resultCount: 0,
            },
          };
        }

        // Convert vector search results to standard format
        results = vectorResults.map(vr => ({
          title: vr.record.tiddlerTitle,
          text: '', // Vector search returns chunks, full text needs separate retrieval
          similarity: vr.similarity,
        }));

        // Retrieve full tiddler content for vector results
        const fullContentResults: typeof results = [];
        for (const result of results) {
          try {
            const tiddlerFields = await wikiService.wikiOperationInServer(
              WikiChannel.getTiddlersAsJson,
              workspaceID,
              [result.title],
            );
            if (tiddlerFields.length > 0) {
              fullContentResults.push({
                ...result,
                text: tiddlerFields[0].text,
                fields: tiddlerFields[0],
              });
            } else {
              fullContentResults.push(result);
            }
          } catch (error) {
            logger.warn(`Error retrieving full tiddler content for ${result.title}`, {
              error,
            });
            fullContentResults.push(result);
          }
        }
        results = fullContentResults;

        searchMetadata = {
          ...searchMetadata,
          query,
          limit,
          threshold,
          resultCount: results.length,
        };
      } catch (error) {
        logger.error('Vector search failed', {
          error,
          workspaceID,
          query,
        });
        return {
          success: false,
          error: i18n.t('Tool.WikiSearch.Error.VectorSearchFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    } else {
      // Traditional filter search
      if (!filter) {
        return {
          success: false,
          error: i18n.t('Tool.WikiSearch.Error.FilterSearchRequiresFilter'),
        };
      }

      const tiddlerTitles = await wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, [filter]);

      if (tiddlerTitles.length === 0) {
        return {
          success: true,
          data: i18n.t('Tool.WikiSearch.Success.NoResults', { filter, workspaceName }),
          metadata: {
            ...searchMetadata,
            filter,
            resultCount: 0,
          },
        };
      }

      // Retrieve full tiddler content for each tiddler
      for (const title of tiddlerTitles) {
        try {
          const tiddlerFields = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [title]);
          if (tiddlerFields.length > 0) {
            results.push({
              title,
              text: tiddlerFields[0].text,
              fields: tiddlerFields[0],
            });
          } else {
            results.push({ title });
          }
        } catch (error) {
          logger.warn(`Error retrieving tiddler content for ${title}`, {
            error,
          });
          results.push({ title });
        }
      }

      searchMetadata = {
        ...searchMetadata,
        filter,
        resultCount: tiddlerTitles.length,
        returnedCount: results.length,
      };
    }

    // Format results as text with content
    let content = '';
    if (searchType === 'vector') {
      content = i18n.t('Tool.WikiSearch.Success.VectorCompleted', {
        totalResults: results.length,
        query,
      });
    } else {
      content = i18n.t('Tool.WikiSearch.Success.Completed', {
        totalResults: results.length,
        shownResults: results.length,
      }) + '\n\n';
    }

    for (const result of results) {
      content += `**Tiddler: ${result.title}**`;
      if (result.similarity !== undefined) {
        content += ` (Similarity: ${(result.similarity * 100).toFixed(1)}%)`;
      }
      content += '\n\n';
      if (result.text) {
        content += '```tiddlywiki\n';
        content += result.text;
        content += '\n```\n\n';
      } else {
        content += '(Content not available)\n\n';
      }
    }

    return {
      success: true,
      data: content,
      metadata: searchMetadata,
    };
  } catch (error) {
    logger.error('Wiki search tool execution error', {
      error,
      parameters,
    });

    return {
      success: false,
      error: i18n.t('Tool.WikiSearch.Error.ExecutionFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

/**
 * Execute wiki update embeddings tool
 */
async function executeWikiUpdateEmbeddingsTool(
  parameters: WikiUpdateEmbeddingsToolParameter,
  context?: { agentId?: string; messageId?: string; aiConfig?: unknown },
): Promise<{ success: boolean; data?: string; error?: string; metadata?: Record<string, unknown> }> {
  try {
    const { workspaceName, forceUpdate = false } = parameters;

    // Get workspace service
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiEmbeddingService = container.get<IWikiEmbeddingService>(serviceIdentifier.WikiEmbedding);

    // Look up workspace ID from workspace name or ID
    const workspaces = await workspaceService.getWorkspacesAsList();
    const targetWorkspace = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);

    if (!targetWorkspace) {
      return {
        success: false,
        error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.WorkspaceNotFound', {
          workspaceName,
          availableWorkspaces: workspaces.map(w => `${w.name} (${w.id})`).join(', '),
        }),
      };
    }

    const workspaceID = targetWorkspace.id;

    if (!await workspaceService.exists(workspaceID)) {
      return {
        success: false,
        error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.WorkspaceNotExist', { workspaceID }),
      };
    }

    // Check if AI config is available
    if (!context?.aiConfig) {
      return {
        success: false,
        error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.NoAIConfig'),
      };
    }

    logger.debug('Executing wiki embedding generation', {
      workspaceID,
      workspaceName,
      forceUpdate,
      agentId: context?.agentId,
    });

    // Generate embeddings
    await wikiEmbeddingService.generateEmbeddings(
      workspaceID,
      context.aiConfig as Parameters<IWikiEmbeddingService['generateEmbeddings']>[1],
      forceUpdate,
    );

    // Get stats after generation
    const stats = await wikiEmbeddingService.getEmbeddingStats(workspaceID);

    const result = i18n.t('Tool.WikiSearch.UpdateEmbeddings.Success.Generated', {
      workspaceName,
      totalEmbeddings: stats.totalEmbeddings,
      totalNotes: stats.totalNotes,
    });

    return {
      success: true,
      data: result,
      metadata: {
        workspaceID,
        workspaceName,
        totalEmbeddings: stats.totalEmbeddings,
        totalNotes: stats.totalNotes,
        forceUpdate,
      },
    };
  } catch (error) {
    logger.error('Wiki update embeddings tool execution error', {
      error,
      parameters,
    });

    return {
      success: false,
      error: i18n.t('Tool.WikiSearch.UpdateEmbeddings.Error.ExecutionFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

/**
 * Wiki Search plugin - Prompt processing
 * Handles tool list injection for wiki search and update embeddings functionality
 */
export const wikiSearchPlugin: PromptConcatPlugin = (hooks) => {
  // First tapAsync: Tool list injection
  hooks.processPrompts.tapAsync('wikiSearchPlugin-toolList', async (context, callback) => {
    const { pluginConfig, prompts } = context;

    if (pluginConfig.pluginId !== 'wikiSearch' || !pluginConfig.wikiSearchParam) {
      callback();
      return;
    }

    const wikiSearchParameter = pluginConfig.wikiSearchParam;

    try {
      // Handle tool list injection if toolListPosition is configured
      const toolListPosition = wikiSearchParameter.toolListPosition;
      if (toolListPosition?.targetId) {
        const toolListTarget = findPromptById(prompts, toolListPosition.targetId);
        if (!toolListTarget) {
          logger.warn('Tool list target prompt not found', {
            targetId: toolListPosition.targetId,
            pluginId: pluginConfig.id,
          });
          callback();
          return;
        }

        // Get available wikis - now handled by workspacesListPlugin
        // The workspaces list will be injected separately by workspacesListPlugin

        // Inject both wiki-search and wiki-update-embeddings tools
        const wikiSearchToolContent = schemaToToolContent(WikiSearchToolParameterSchema);
        const wikiUpdateEmbeddingsToolContent = schemaToToolContent(WikiUpdateEmbeddingsToolParameterSchema);

        // Combine both tools into one prompt
        const combinedToolContent = `${wikiSearchToolContent}\n\n${wikiUpdateEmbeddingsToolContent}`;

        const toolPrompt: IPrompt = {
          id: `wiki-tool-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: combinedToolContent,
          tags: ['toolList', 'wikiSearch', 'wikiEmbedding'],
          // Use singular caption to match test expectations
          caption: 'Wiki search tool',
          enabled: true,
        };

        // Insert at specified position
        if (toolListPosition.position === 'before') {
          toolListTarget.parent.splice(toolListTarget.index, 0, toolPrompt);
        } else {
          toolListTarget.parent.splice(toolListTarget.index + 1, 0, toolPrompt);
        }

        logger.debug('Wiki tool list injected successfully', {
          targetId: toolListPosition.targetId,
          position: toolListPosition.position,
          toolCount: 2, // wiki-search and wiki-update-embeddings
          pluginId: pluginConfig.id,
        });
      }

      callback();
    } catch (error) {
      logger.error('Error in wiki search tool list injection', {
        error,
        pluginId: pluginConfig.id,
      });
      callback();
    }
  });

  // 2. Tool execution when AI response is complete
  hooks.responseComplete.tapAsync('wikiSearchPlugin-handler', async (context, callback) => {
    try {
      const { handlerContext, response, handlerConfig } = context;

      // Find this plugin's configuration from handlerConfig
      const wikiSearchPluginConfig = handlerConfig?.plugins?.find(p => p.pluginId === 'wikiSearch');
      const wikiSearchParameter = wikiSearchPluginConfig?.wikiSearchParam as { toolResultDuration?: number } | undefined;
      const toolResultDuration = wikiSearchParameter?.toolResultDuration || 1; // Default to 1 round

      if (response.status !== 'done' || !response.content) {
        callback();
        return;
      }

      // Check for wiki search or update embeddings tool calls in the AI response
      const toolMatch = matchToolCalling(response.content);

      if (!toolMatch.found || (toolMatch.toolId !== 'wiki-search' && toolMatch.toolId !== 'wiki-update-embeddings')) {
        callback();
        return;
      }

      logger.debug('Wiki tool call detected', {
        toolId: toolMatch.toolId,
        agentId: handlerContext.agent.id,
      });

      // Set duration=1 for the AI message containing the tool call
      // Find the most recent AI message (should be the one containing the tool call)
      const aiMessages = handlerContext.agent.messages.filter(message => message.role === 'assistant');
      if (aiMessages.length > 0) {
        const latestAiMessage = aiMessages[aiMessages.length - 1];
        if (latestAiMessage.content === response.content) {
          latestAiMessage.duration = 1;
          latestAiMessage.metadata = {
            ...latestAiMessage.metadata,
            containsToolCall: true,
            toolId: toolMatch.toolId,
          };

          // Notify frontend about the duration change immediately (no debounce delay)
          const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
          // Persist the AI message right away so DB ordering reflects this message before tool results
          try {
            if (!latestAiMessage.created) latestAiMessage.created = new Date();
            await agentInstanceService.saveUserMessage(latestAiMessage);
            latestAiMessage.metadata = { ...latestAiMessage.metadata, isPersisted: true };
          } catch (error) {
            logger.warn('Failed to persist AI message containing tool call immediately', {
              error,
              messageId: latestAiMessage.id,
            });
          }

          // Also update UI immediately
          agentInstanceService.debounceUpdateMessage(latestAiMessage, handlerContext.agent.id, 0); // No delay

          logger.debug('Set duration=1 for AI tool call message', {
            messageId: latestAiMessage.id,
            toolId: toolMatch.toolId,
          });
        }
      }

      // Execute the appropriate tool
      try {
        // Check if cancelled before starting tool execution
        if (handlerContext.isCancelled()) {
          logger.debug('Wiki tool cancelled before execution', {
            toolId: toolMatch.toolId,
            agentId: handlerContext.agent.id,
          });
          callback();
          return;
        }

        // Validate parameters and execute based on tool type
        let result: { success: boolean; data?: string; error?: string; metadata?: Record<string, unknown> };
        let validatedParameters: WikiSearchToolParameter | WikiUpdateEmbeddingsToolParameter;

        if (toolMatch.toolId === 'wiki-search') {
          validatedParameters = WikiSearchToolParameterSchema.parse(toolMatch.parameters);
          result = await executeWikiSearchTool(
            validatedParameters,
            {
              agentId: handlerContext.agent.id,
              messageId: handlerContext.agent.messages[handlerContext.agent.messages.length - 1]?.id,
              config: handlerContext.agent.aiApiConfig as AiAPIConfig | undefined,
            },
          );
        } else {
          // wiki-update-embeddings
          validatedParameters = WikiUpdateEmbeddingsToolParameterSchema.parse(toolMatch.parameters);
          result = await executeWikiUpdateEmbeddingsTool(
            validatedParameters,
            {
              agentId: handlerContext.agent.id,
              messageId: handlerContext.agent.messages[handlerContext.agent.messages.length - 1]?.id,
              aiConfig: handlerContext.agent.aiApiConfig,
            },
          );
        }

        // Check if cancelled after tool execution
        if (handlerContext.isCancelled()) {
          logger.debug('Wiki tool cancelled after execution', {
            toolId: toolMatch.toolId,
            agentId: handlerContext.agent.id,
          });
          callback();
          return;
        }

        // Format the tool result for display
        let toolResultText: string;
        let isError = false;

        if (result.success && result.data) {
          toolResultText = `<functions_result>\nTool: ${toolMatch.toolId}\nParameters: ${JSON.stringify(validatedParameters)}\nResult: ${result.data}\n</functions_result>`;
        } else {
          isError = true;
          toolResultText = `<functions_result>\nTool: ${toolMatch.toolId}\nParameters: ${JSON.stringify(validatedParameters)}\nError: ${result.error}\n</functions_result>`;
        }

        // Set up actions to continue the conversation with tool results
        const responseContext = context;
        if (!responseContext.actions) {
          responseContext.actions = {};
        }
        responseContext.actions.yieldNextRoundTo = 'self';

        logger.debug('Wiki search setting yieldNextRoundTo=self', {
          toolId: 'wiki-search',
          agentId: handlerContext.agent.id,
          messageCount: handlerContext.agent.messages.length,
          toolResultPreview: toolResultText.slice(0, 200),
        });

        // Immediately add the tool result message to history BEFORE calling toolExecuted
        const nowTool = new Date();
        const toolResultMessage: AgentInstanceMessage = {
          id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          agentId: handlerContext.agent.id,
          role: 'tool', // Tool result message
          content: toolResultText,
          created: nowTool,
          modified: nowTool,
          duration: toolResultDuration, // Use configurable duration - default 1 round for tool results
          metadata: {
            isToolResult: true,
            isError,
            toolId: 'wiki-search',
            toolParameters: validatedParameters,
            isPersisted: false, // Required by messageManagementPlugin to identify new tool results
            isComplete: true, // Mark as complete to prevent messageManagementPlugin from overwriting content
            artificialOrder: Date.now() + 10, // Additional ordering hint
          },
        };
        handlerContext.agent.messages.push(toolResultMessage);

        // Do not persist immediately here. Let messageManagementPlugin handle persistence

        // Signal that tool was executed AFTER adding and persisting the message
        await hooks.toolExecuted.promise({
          handlerContext,
          toolResult: {
            success: true,
            data: result.success ? result.data : result.error,
            metadata: { toolCount: 1 },
          },
          toolInfo: {
            toolId: 'wiki-search',
            parameters: validatedParameters,
            originalText: toolMatch.originalText,
          },
          requestId: context.requestId,
        });

        logger.debug('Wiki search tool execution completed', {
          toolResultText,
          actions: responseContext.actions,
          toolResultMessageId: toolResultMessage.id,
          aiMessageDuration: aiMessages[aiMessages.length - 1]?.duration,
        });
      } catch (error) {
        logger.error('Wiki search tool execution failed', {
          error,
          toolCall: toolMatch,
        });

        // Set up error response for next round
        const responseContext = context;
        if (!responseContext.actions) {
          responseContext.actions = {};
        }
        responseContext.actions.yieldNextRoundTo = 'self';
        const errorMessage = `<functions_result>
Tool: wiki-search
Error: ${error instanceof Error ? error.message : String(error)}
</functions_result>`;

        // Add error message to history BEFORE calling toolExecuted
        // Use the current time; order will be determined by save order
        const nowError = new Date();
        const errorResultMessage: AgentInstanceMessage = {
          id: `tool-error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          agentId: handlerContext.agent.id,
          role: 'tool', // Tool error message
          content: errorMessage,
          created: nowError,
          modified: nowError,
          duration: 2, // Error messages are visible to AI for 2 rounds: immediate + next round to allow explanation
          metadata: {
            isToolResult: true,
            isError: true,
            toolId: 'wiki-search',
            isPersisted: false, // Required by messageManagementPlugin to identify new tool results
            isComplete: true, // Mark as complete to prevent messageManagementPlugin from overwriting content
          },
        };
        handlerContext.agent.messages.push(errorResultMessage);

        // Do not persist immediately; let messageManagementPlugin handle it during toolExecuted
        await hooks.toolExecuted.promise({
          handlerContext,
          toolResult: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          toolInfo: {
            toolId: 'wiki-search',
            parameters: {},
          },
        });

        logger.debug('Wiki search tool execution failed but error result added', {
          errorResultMessageId: errorResultMessage.id,
          aiMessageDuration: aiMessages[aiMessages.length - 1]?.duration,
        });
      }

      callback();
    } catch (error) {
      logger.error('Error in wiki search handler plugin', { error });
      callback();
    }
  });
};
