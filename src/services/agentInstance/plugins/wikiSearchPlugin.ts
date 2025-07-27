/**
 * Wiki Search plugin
 * Handles wiki tool list injection, tool calling det    // Retrieve tiddlers using the filter ex        try {
          const tiddlerFields = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [title]);
          if (tiddlerFields.length > 0) {
            results.push({
              title,
              text: tiddlerFields[0].text,
              fields: tiddlerFields[0],
            });
          } else {
            results.push({ title });
          }  const tiddlerTitles = await wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, [filter]) as string[];

    if (tiddlerTitles.length === 0) {
      return {
        success: true,
        data: `No results found for filter "${filter}" in wiki workspace "${workspaceName}".`,
        metadata: {
          filter,
          workspaceID,
          workspaceName,
          resultCount: 0,
        },
      };
    }on and response processing
 */
import { z } from 'zod/v4';

import { WikiChannel } from '@/constants/channels';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';

import type { AgentInstanceMessage } from '../interface';
import { findPromptById, PromptConcatContext } from '../promptConcat/promptConcat';
import type { IPrompt, RetrievalAugmentedGenerationParameterSchema } from '../promptConcat/promptConcatSchema';
import type { HandlerPlugin, PromptConcatPlugin, ResponseHookContext } from './types';

// Type for the actual parameter (inferred from schema)
type WikiSearchParameter = z.infer<typeof RetrievalAugmentedGenerationParameterSchema>;

/**
 * Parameter schema for Wiki search tool
 */
const WikiSearchToolParameterSchema = z.object({
  workspaceName: z.string().describe('The name of the wiki workspace to search in'),
  filter: z.string().describe('TiddlyWiki filter expression for searching'),
  maxResults: z.number().optional().default(10).describe('Maximum number of results to return'),
  includeText: z.boolean().optional().default(true).describe('Whether to include tiddler text content'),
});

type WikiSearchToolParameter = z.infer<typeof WikiSearchToolParameterSchema>;

/**
 * Execute wiki search tool
 */
async function executeWikiSearchTool(
  parameters: WikiSearchToolParameter,
  context?: { agentId?: string; messageId?: string },
): Promise<{ success: boolean; data?: string; error?: string; metadata?: Record<string, unknown> }> {
  try {
    const { workspaceName, filter, maxResults, includeText } = parameters;

    // Get workspace service
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

    // Look up workspace ID from workspace name
    const workspaces = await workspaceService.getWorkspacesAsList();
    const targetWorkspace = workspaces.find(ws => ws.name === workspaceName);

    if (!targetWorkspace) {
      return {
        success: false,
        error: `Workspace with name "${workspaceName}" does not exist`,
      };
    }

    const workspaceID = targetWorkspace.id;

    if (!await workspaceService.exists(workspaceID)) {
      return {
        success: false,
        error: `Workspace ${workspaceID} does not exist`,
      };
    }

    logger.debug('Executing wiki search', {
      workspaceID,
      workspaceName,
      filter,
      maxResults,
      includeText,
      agentId: context?.agentId,
    });

    // Retrieve tiddlers using the filter expression
    const tiddlerTitles = await wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, [filter]);

    if (tiddlerTitles.length === 0) {
      return {
        success: true,
        data: `No results found for filter "${filter}" in wiki workspace "${workspaceName}".`,
        metadata: {
          filter,
          workspaceID,
          workspaceName,
          resultCount: 0,
        },
      };
    }

    // Limit results if needed
    const limitedTitles = tiddlerTitles.slice(0, maxResults);

    logger.debug(`Found ${tiddlerTitles.length} tiddlers, returning ${limitedTitles.length}`, {
      totalFound: tiddlerTitles.length,
      returning: limitedTitles.length,
    });

    // Retrieve full tiddler content if requested
    const results: Array<{ title: string; text?: string; fields?: ITiddlerFields }> = [];

    if (includeText) {
      // Retrieve full tiddler content for each tiddler
      for (const title of limitedTitles) {
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
            error: error instanceof Error ? error.message : String(error),
          });
          results.push({ title });
        }
      }
    } else {
      // Just return titles
      for (const title of limitedTitles) {
        results.push({ title });
      }
    }

    // Format results as text
    let content = `Wiki search completed successfully. Found ${tiddlerTitles.length} total results, showing ${results.length}:\n\n`;

    for (const result of results) {
      content += `**Tiddler: ${result.title}**\n\n`;
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
      metadata: {
        filter,
        workspaceID,
        workspaceName,
        maxResults,
        includeText,
        resultCount: tiddlerTitles.length,
        returnedCount: results.length,
      },
    };
  } catch (error) {
    logger.error('Wiki search tool execution error', {
      error: error instanceof Error ? error.message : String(error),
      parameters,
    });

    return {
      success: false,
      error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Checks if a trigger condition matches the current context
 */
function checkTriggerCondition(
  trigger: WikiSearchParameter['trigger'],
  context: PromptConcatContext,
): boolean {
  if (!trigger) {
    return true;
  }

  // Get the last user message (if any)
  const userMessages = context.messages.filter((m) => m.role === 'user');
  const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  // Check search term trigger
  if (trigger.search && lastUserMessage && lastUserMessage.toLowerCase().includes(trigger.search.toLowerCase())) {
    logger.debug('Trigger matched by search term', { search: trigger.search });
    return true;
  }

  // Check random chance trigger
  if (trigger.randomChance !== undefined) {
    const randomValue = Math.random();
    const triggered = randomValue < trigger.randomChance;
    logger.debug('Random chance trigger evaluation', {
      randomValue,
      threshold: trigger.randomChance,
      triggered,
    });
    return triggered;
  }

  return false;
}

/**
 * Wiki Search plugin - Prompt processing
 * Handles tool list injection for wiki search functionality
 */
export const wikiSearchPlugin: PromptConcatPlugin = (hooks) => {
  // First tapAsync: Tool list injection
  hooks.processPrompts.tapAsync('wikiSearchPlugin-toolList', async (context, callback) => {
    const { pluginConfig, prompts } = context;

    if (pluginConfig.pluginId !== 'wikiSearch' || !pluginConfig.retrievalAugmentedGenerationParam) {
      callback();
      return;
    }

    const wikiSearchParameter = pluginConfig.retrievalAugmentedGenerationParam;

    try {
      // Check if trigger condition is met
      const shouldTrigger = checkTriggerCondition(wikiSearchParameter.trigger, context);
      if (!shouldTrigger) {
        logger.debug('Trigger condition not met, skipping wiki search tool list injection', {
          pluginId: pluginConfig.id,
        });
        callback();
        return;
      }

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

        // Get available wikis
        const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
        const workspaces = await workspaceService.getWorkspacesAsList();
        const wikiWorkspaces = workspaces.filter(isWikiWorkspace);

        if (wikiWorkspaces.length > 0) {
          const workspaceList = wikiWorkspaces
            .map(workspace => `- ${workspace.name} (ID: ${workspace.id})`)
            .join('\n');

          const toolPromptContent =
            `Available Wiki Workspaces:\n${workspaceList}\n\nAvailable Tools:\n- Tool ID: wiki-search\n- Tool Name: Wiki Search\n- Description: Search content in wiki workspaces\n- Parameters: {\n  "workspaceName": "string (required) - The name of the wiki workspace to search in",\n  "filter": "string (required) - TiddlyWiki filter expression for searching",\n  "maxResults": "number (optional, default: 10) - Maximum number of results to return",\n  "includeText": "boolean (optional, default: true) - Whether to include tiddler text content"\n}`;

          const toolPrompt: IPrompt = {
            id: `wiki-tool-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: toolPromptContent,
            tags: ['toolList', 'wikiSearch'],
            caption: 'Wiki workspaces and search tool',
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
            wikiCount: wikiWorkspaces.length,
            pluginId: pluginConfig.id,
          });
        }
      }

      callback();
    } catch (error) {
      logger.error('Error in wiki search tool list injection', {
        error: error instanceof Error ? error.message : String(error),
        pluginId: pluginConfig.id,
      });
      callback();
    }
  });

  // Second tapAsync: Wiki content injection based on wiki parameters
  hooks.processPrompts.tapAsync('wikiSearchPlugin-content', async (context, callback) => {
    const { pluginConfig, prompts } = context;

    if (pluginConfig.pluginId !== 'wikiSearch' || !pluginConfig.retrievalAugmentedGenerationParam) {
      callback();
      return;
    }

    const wikiSearchParameter = pluginConfig.retrievalAugmentedGenerationParam;

    try {
      // Only inject wiki content if wikiParam is configured
      if (!wikiSearchParameter.wikiParam) {
        callback();
        return;
      }

      const target = findPromptById(prompts, wikiSearchParameter.targetId);
      if (!target) {
        logger.warn('Wiki content target prompt not found', {
          targetId: wikiSearchParameter.targetId,
          pluginId: pluginConfig.id,
        });
        callback();
        return;
      }

      const { workspaceName, filter } = wikiSearchParameter.wikiParam;

      // Get workspace by name
      const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
      const workspaces = await workspaceService.getWorkspacesAsList();
      const targetWorkspace = workspaces.find(ws => isWikiWorkspace(ws) && ws.name === workspaceName);

      if (!targetWorkspace) {
        logger.warn('Wiki workspace not found for content injection', {
          workspaceName,
          pluginId: pluginConfig.id,
        });
        callback();
        return;
      }

      // For now, create a placeholder for wiki content
      // TODO: Implement actual wiki content retrieval using the workspace service
      let wikiContent = `Wiki content from "${workspaceName}"`;

      if (filter) {
        wikiContent += ` with filter: "${filter}"`;
        // TODO: Apply actual filtering logic based on the filter parameter
      }

      wikiContent += `\n\nThis is where actual wiki content would be retrieved and filtered.`;

      const wikiPrompt: IPrompt = {
        id: `wiki-content-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: wikiContent,
        tags: ['wikiContent', 'wikiSearch'],
        caption: `Wiki content from ${workspaceName}`,
        enabled: true,
      };

      // Insert based on position
      switch (wikiSearchParameter.position) {
        case 'before':
          target.parent.splice(target.index, 0, wikiPrompt);
          break;
        case 'after':
          target.parent.splice(target.index + 1, 0, wikiPrompt);
          break;
        case 'relative':
          // Add to target's children
          if (!target.prompt.children) {
            target.prompt.children = [];
          }
          target.prompt.children.push(wikiPrompt);
          break;
        case 'absolute':
          // For absolute positioning, we would need bottom parameter
          // For now, default to after
          target.parent.splice(target.index + 1, 0, wikiPrompt);
          break;
        default:
          target.parent.splice(target.index + 1, 0, wikiPrompt);
          break;
      }

      logger.debug('Wiki content injected successfully', {
        workspaceName,
        filter,
        targetId: wikiSearchParameter.targetId,
        position: wikiSearchParameter.position,
        contentLength: wikiContent.length,
        pluginId: pluginConfig.id,
      });

      callback();
    } catch (error) {
      logger.error('Error in wiki content injection', {
        error: error instanceof Error ? error.message : String(error),
        pluginId: pluginConfig.id,
      });
      callback();
    }
  });
};

/**
 * Wiki Search Handler Plugin
 * Handles tool calling detection, execution and response processing
 */
export const wikiSearchHandlerPlugin: HandlerPlugin = (hooks) => {
  // Handle AI response for tool calling detection and execution
  hooks.responseComplete.tapAsync('wikiSearchHandlerPlugin', async (context, callback) => {
    try {
      const { handlerContext, response } = context;

      if (response.status !== 'done' || !response.content) {
        callback();
        return;
      }

      // Check for wiki search tool calls in the AI response
      const toolMatch = matchToolCalling(response.content);

      if (!toolMatch.found || toolMatch.toolId !== 'wiki-search') {
        callback();
        return;
      }

      logger.debug('Wiki search tool call detected', {
        toolId: toolMatch.toolId,
        agentId: handlerContext.agent.id,
      });

      // Execute the wiki search tool call
      try {
        // Validate parameters against schema
        const validatedParameters = WikiSearchToolParameterSchema.parse(toolMatch.parameters);

        // Execute the tool
        const result = await executeWikiSearchTool(
          validatedParameters,
          {
            agentId: handlerContext.agent.id,
            messageId: handlerContext.agent.messages[handlerContext.agent.messages.length - 1]?.id,
          },
        );

        let toolResultText: string;
        if (result.success && result.data) {
          toolResultText = `<functions_result>\nTool: wiki-search\nParameters: ${JSON.stringify(validatedParameters)}\nResult: ${result.data}\n</functions_result>`;
        } else {
          toolResultText = `<functions_result>\nTool: wiki-search\nParameters: ${JSON.stringify(validatedParameters)}\nError: ${
            result.error || 'Unknown error'
          }\n</functions_result>`;
        }

        // Create a new user message with tool results
        const toolResultMessage: AgentInstanceMessage = {
          id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          agentId: handlerContext.agent.id,
          role: 'user',
          content: toolResultText,
          contentType: 'text/plain',
          modified: new Date(),
          metadata: { isToolResult: true, toolCount: 1 },
        };

        // Add tool result message to agent's message history
        handlerContext.agent.messages.push(toolResultMessage);

        // Trigger tool execution hook for persistence
        await new Promise<void>((resolve, reject) => {
          hooks.toolExecuted.callAsync({
            handlerContext,
            toolResult: {
              success: true,
              data: toolResultText,
              metadata: { toolCount: 1 },
            },
            toolInfo: {
              toolId: 'wiki-search',
              parameters: validatedParameters,
              originalText: toolMatch.originalText || '',
            },
            requestId: context.requestId,
          }, (error: Error | null) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });

        logger.info('Wiki search tool execution completed, triggering new round', {
          resultLength: toolResultText.length,
          agentId: handlerContext.agent.id,
        });

        // Set up for next round with yieldNextRoundTo = 'self'
        // This will trigger the AI to respond again with the tool results
        const responseContext = context as unknown as ResponseHookContext;
        if (!responseContext.actions) {
          responseContext.actions = {};
        }
        responseContext.actions.yieldNextRoundTo = 'self';
        responseContext.actions.newUserMessage = toolResultText;
      } catch (error) {
        logger.error('Wiki search tool execution failed', {
          error: error instanceof Error ? error.message : String(error),
          toolCall: toolMatch,
        });
      }

      callback();
    } catch (error) {
      logger.error('Error in wiki search handler plugin', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback();
    }
  });
};
