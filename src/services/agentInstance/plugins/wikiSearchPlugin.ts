/**
 * Wiki Search plugin
 * Handles wiki search tool list injection, tool calling detection and response processing
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

import { findPromptById } from '../promptConcat/promptConcat';
import type { IPrompt } from '../promptConcat/promptConcatSchema';
import type { ResponseHookContext, PromptConcatPlugin } from './types';

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
 * Wiki Search plugin - Prompt processing
 * Handles tool list injection for wiki search functionality
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

  // 2. Tool execution when AI response is complete
  hooks.responseComplete.tapAsync('wikiSearchPlugin-handler', async (context, callback) => {
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

        // Signal that tool was executed
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
            originalText: toolMatch.originalText || '',
          },
          requestId: context.requestId,
        });

        // Format the tool result for display
        let toolResultText: string;
        if (result.success && result.data) {
          toolResultText = `<functions_result>\nTool: wiki-search\nParameters: ${JSON.stringify(validatedParameters)}\nResult: ${result.data}\n</functions_result>`;
        } else {
          toolResultText = `<functions_result>\nTool: wiki-search\nParameters: ${JSON.stringify(validatedParameters)}\nError: ${
            result.error || 'Unknown error'
          }\n</functions_result>`;
        }

        // Set up actions to continue the conversation with tool results
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

        // Set up error response for next round
        const responseContext = context as unknown as ResponseHookContext;
        if (!responseContext.actions) {
          responseContext.actions = {};
        }
        responseContext.actions.yieldNextRoundTo = 'self';
        responseContext.actions.newUserMessage = `<functions_result>
Tool: wiki-search
Error: ${error instanceof Error ? error.message : String(error)}
</functions_result>`;
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
