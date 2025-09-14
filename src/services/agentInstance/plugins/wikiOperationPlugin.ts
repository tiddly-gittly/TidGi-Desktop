/**
 * Wiki Operation plugin
 * Handles wiki operation tool list injection, tool calling detection and response processing
 * Supports creating, updating, and deleting tiddlers in wiki workspaces
 */
import { WikiChannel } from '@/constants/channels';
import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import { z } from 'zod/v4';
import type { AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { findPromptById } from '../promptConcat/promptConcat';
import { schemaToToolContent } from '../utilities/schemaToToolContent';
import type { PromptConcatPlugin } from './types';

/**
 * Wiki Operation Parameter Schema
 * Configuration parameters for the wiki operation plugin
 */
export const WikiOperationParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({
      title: t('Schema.WikiOperation.ToolListPosition.TargetIdTitle'),
      description: t('Schema.WikiOperation.ToolListPosition.TargetId'),
    }),
    position: z.enum(['before', 'after']).meta({
      title: t('Schema.WikiOperation.ToolListPosition.PositionTitle'),
      description: t('Schema.WikiOperation.ToolListPosition.Position'),
    }),
  }).optional().meta({
    title: t('Schema.WikiOperation.ToolListPositionTitle'),
    description: t('Schema.WikiOperation.ToolListPosition'),
  }),
  toolResultDuration: z.number().optional().default(1).meta({
    title: t('Schema.WikiOperation.ToolResultDurationTitle'),
    description: t('Schema.WikiOperation.ToolResultDuration'),
  }),
}).meta({
  title: t('Schema.WikiOperation.Title'),
  description: t('Schema.WikiOperation.Description'),
});

/**
 * Type definition for wiki operation parameters
 */
export type WikiOperationParameter = z.infer<typeof WikiOperationParameterSchema>;

/**
 * Get the wiki operation parameter schema
 * @returns The schema for wiki operation parameters
 */
export function getWikiOperationParameterSchema() {
  return WikiOperationParameterSchema;
}

/**
 * Parameter schema for Wiki operation tool
 */
const WikiOperationToolParameterSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.WikiOperation.Tool.Parameters.workspaceName.Title'),
    description: t('Schema.WikiOperation.Tool.Parameters.workspaceName.Description'),
  }),
  operation: z.enum([WikiChannel.addTiddler, WikiChannel.deleteTiddler, WikiChannel.setTiddlerText]).meta({
    title: t('Schema.WikiOperation.Tool.Parameters.operation.Title'),
    description: t('Schema.WikiOperation.Tool.Parameters.operation.Description'),
  }),
  title: z.string().meta({
    title: t('Schema.WikiOperation.Tool.Parameters.title.Title'),
    description: t('Schema.WikiOperation.Tool.Parameters.title.Description'),
  }),
  text: z.string().optional().meta({
    title: t('Schema.WikiOperation.Tool.Parameters.text.Title'),
    description: t('Schema.WikiOperation.Tool.Parameters.text.Description'),
  }),
  extraMeta: z.string().optional().default('{}').meta({
    title: t('Schema.WikiOperation.Tool.Parameters.extraMeta.Title'),
    description: t('Schema.WikiOperation.Tool.Parameters.extraMeta.Description'),
  }),
  options: z.string().optional().default('{}').meta({
    title: t('Schema.WikiOperation.Tool.Parameters.options.Title'),
    description: t('Schema.WikiOperation.Tool.Parameters.options.Description'),
  }),
})
  .meta({
    title: 'wiki-operation',
    description: '在Wiki工作空间中执行操作（添加、删除或设置Tiddler文本）',
    examples: [
      { workspaceName: '我的知识库', operation: WikiChannel.addTiddler, title: '示例笔记', text: '示例内容', extraMeta: '{}', options: '{}' },
      { workspaceName: '我的知识库', operation: WikiChannel.setTiddlerText, title: '现有笔记', text: '更新后的内容', extraMeta: '{}', options: '{}' },
      { workspaceName: '我的知识库', operation: WikiChannel.deleteTiddler, title: '要删除的笔记', extraMeta: '{}', options: '{}' },
    ],
  });

/**
 * Wiki Operation plugin - Prompt processing
 * Handles tool list injection for wiki operation functionality
 */
export const wikiOperationPlugin: PromptConcatPlugin = (hooks) => {
  // First tapAsync: Tool list injection
  hooks.processPrompts.tapAsync('wikiOperationPlugin-toolList', async (context, callback) => {
    const { pluginConfig, prompts } = context;

    if (pluginConfig.pluginId !== 'wikiOperation' || !pluginConfig.wikiOperationParam) {
      callback();
      return;
    }

    const wikiOperationParameter = pluginConfig.wikiOperationParam;

    try {
      // Handle tool list injection if toolListPosition is configured
      const toolListPosition = wikiOperationParameter.toolListPosition;
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

        // Build tool content using shared utility (schema contains title/examples meta)
        const wikiOperationToolContent = schemaToToolContent(WikiOperationToolParameterSchema);

        // Insert the tool content based on position
        if (toolListPosition.position === 'after') {
          if (!toolListTarget.prompt.children) {
            toolListTarget.prompt.children = [];
          }
          const insertIndex = toolListTarget.prompt.children.length;
          toolListTarget.prompt.children.splice(insertIndex, 0, {
            id: `wiki-operation-tool-${pluginConfig.id}`,
            caption: 'Wiki Operation Tool',
            text: wikiOperationToolContent,
          });
        } else if (toolListPosition.position === 'before') {
          if (!toolListTarget.prompt.children) {
            toolListTarget.prompt.children = [];
          }
          toolListTarget.prompt.children.unshift({
            id: `wiki-operation-tool-${pluginConfig.id}`,
            caption: 'Wiki Operation Tool',
            text: wikiOperationToolContent,
          });
        } else {
          // Default to appending text
          toolListTarget.prompt.text = (toolListTarget.prompt.text || '') + wikiOperationToolContent;
        }

        logger.debug('Wiki operation tool list injected', {
          targetId: toolListPosition.targetId,
          position: toolListPosition.position,
          pluginId: pluginConfig.id,
        });
      }

      callback();
    } catch (error) {
      logger.error('Error in wiki operation tool list injection', {
        error: error instanceof Error ? error.message : String(error),
        pluginId: pluginConfig.id,
      });
      callback();
    }
  });

  // 2. Tool execution when AI response is complete
  hooks.responseComplete.tapAsync('wikiOperationPlugin-handler', async (context, callback) => {
    try {
      const { handlerContext, response, handlerConfig } = context;

      // Find this plugin's configuration from handlerConfig
      const wikiOperationPluginConfig = handlerConfig?.plugins?.find(p => p.pluginId === 'wikiOperation');
      const wikiOperationParameter = wikiOperationPluginConfig?.wikiOperationParam as { toolResultDuration?: number } | undefined;
      const toolResultDuration = wikiOperationParameter?.toolResultDuration || 1; // Default to 1 round

      if (response.status !== 'done' || !response.content) {
        callback();
        return;
      }

      // Check for wiki operation tool calls in the AI response
      const toolMatch = matchToolCalling(response.content);

      if (!toolMatch.found || toolMatch.toolId !== 'wiki-operation') {
        callback();
        return;
      }

      logger.debug('Wiki operation tool call detected', {
        toolId: toolMatch.toolId,
        agentId: handlerContext.agent.id,
      });

      // Set duration=1 for the AI message containing the tool call
      // Find the most recent AI message (should be the one containing the tool call)
      const aiMessages = handlerContext.agent.messages.filter(message => message.role === 'assistant');
      if (aiMessages.length > 0) {
        const latestAiMessage = aiMessages[aiMessages.length - 1];
        latestAiMessage.duration = toolResultDuration;
        logger.debug('Set AI message duration for tool call', {
          messageId: latestAiMessage.id,
          duration: toolResultDuration,
          agentId: handlerContext.agent.id,
        });
      }

      // Execute the wiki operation tool call
      try {
        logger.debug('Parsing wiki operation tool parameters', {
          toolMatch: toolMatch.parameters,
          agentId: handlerContext.agent.id,
        });

        // Use parameters returned by matchToolCalling directly. Let zod schema validate.
        const validatedParameters = WikiOperationToolParameterSchema.parse(toolMatch.parameters as Record<string, unknown>);
        const { workspaceName, operation, title, text, extraMeta, options: optionsString } = validatedParameters;
        const options = JSON.parse(optionsString || '{}') as Record<string, unknown>;
        // Get workspace service
        const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
        const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

        // Look up workspace ID from workspace name or ID
        const workspaces = await workspaceService.getWorkspacesAsList();
        const targetWorkspace = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
        if (!targetWorkspace) {
          throw new Error(
            i18n.t('Tool.WikiOperation.Error.WorkspaceNotFound', {
              workspaceName,
              availableWorkspaces: workspaces.map(w => `${w.name} (${w.id})`).join(', '),
            }) || `Workspace with name or ID "${workspaceName}" does not exist. Available workspaces: ${workspaces.map(w => `${w.name} (${w.id})`).join(', ')}`,
          );
        }
        const workspaceID = targetWorkspace.id;

        if (!await workspaceService.exists(workspaceID)) {
          throw new Error(i18n.t('Tool.WikiOperation.Error.WorkspaceNotExist', { workspaceID }));
        }

        logger.debug('Executing wiki operation', {
          workspaceID,
          workspaceName,
          operation,
          title,
          agentId: handlerContext.agent.id,
        });

        let result: string;

        // Execute the appropriate wiki operation directly
        switch (operation) {
          case WikiChannel.addTiddler: {
            await wikiService.wikiOperationInServer(WikiChannel.addTiddler, workspaceID, [
              title,
              text || '',
              extraMeta || '{}',
              JSON.stringify({ withDate: true, ...options }),
            ]);
            result = i18n.t('Tool.WikiOperation.Success.Added', { title, workspaceName });
            break;
          }

          case WikiChannel.deleteTiddler: {
            await wikiService.wikiOperationInServer(WikiChannel.deleteTiddler, workspaceID, [title]);
            result = i18n.t('Tool.WikiOperation.Success.Deleted', { title, workspaceName });
            break;
          }

          case WikiChannel.setTiddlerText: {
            await wikiService.wikiOperationInServer(WikiChannel.setTiddlerText, workspaceID, [title, text || '']);
            result = i18n.t('Tool.WikiOperation.Success.Updated', { title, workspaceName });
            break;
          }

          default: {
            const exhaustiveCheck: never = operation;
            throw new Error(`Unsupported operation: ${String(exhaustiveCheck)}`);
          }
        }

        logger.debug('Wiki operation tool execution completed successfully', {
          workspaceID,
          operation,
          title,
          agentId: handlerContext.agent.id,
        });

        // Format the tool result for display
        const toolResultText = `<functions_result>\nTool: wiki-operation\nParameters: ${JSON.stringify(validatedParameters)}\nResult: ${result}\n</functions_result>`;

        // Set up actions to continue the conversation with tool results
        if (!context.actions) {
          context.actions = {};
        }
        context.actions.yieldNextRoundTo = 'self';

        logger.debug('Wiki operation setting yieldNextRoundTo=self', {
          toolId: 'wiki-operation',
          agentId: handlerContext.agent.id,
          messageCount: handlerContext.agent.messages.length,
          toolResultPreview: toolResultText.slice(0, 200),
        });

        // Immediately add the tool result message to history BEFORE calling toolExecuted
        const toolResultTime = new Date();
        const toolResultMessage: AgentInstanceMessage = {
          id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          agentId: handlerContext.agent.id,
          role: 'tool', // Tool result message
          content: toolResultText,
          modified: toolResultTime,
          duration: toolResultDuration, // Use configurable duration - default 1 round for tool results
          metadata: {
            isToolResult: true,
            isError: false,
            toolId: 'wiki-operation',
            toolParameters: validatedParameters,
            isPersisted: false, // Required by messageManagementPlugin to identify new tool results
            isComplete: true, // Mark as complete to prevent messageManagementPlugin from overwriting content
            artificialOrder: Date.now() + 10, // Additional ordering hint
          },
        };
        handlerContext.agent.messages.push(toolResultMessage);

        // Persist tool result immediately so DB ordering matches in-memory order
        try {
          const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
          await agentInstanceService.saveUserMessage(toolResultMessage);
          toolResultMessage.metadata = { ...toolResultMessage.metadata, isPersisted: true };
        } catch (persistError) {
          logger.warn('Failed to persist tool result immediately in wikiOperationPlugin', {
            error: persistError instanceof Error ? persistError.message : String(persistError),
            messageId: toolResultMessage.id,
          });
        }

        // Signal that tool was executed AFTER adding and persisting the message
        await hooks.toolExecuted.promise({
          handlerContext,
          toolResult: {
            success: true,
            data: result,
            metadata: { toolCount: 1 },
          },
          toolInfo: {
            toolId: 'wiki-operation',
            parameters: validatedParameters,
            originalText: toolMatch.originalText || '',
          },
          requestId: context.requestId,
        });

        logger.debug('Wiki operation tool execution completed', {
          toolResultText,
          actions: context.actions,
          toolResultMessageId: toolResultMessage.id,
          aiMessageDuration: aiMessages[aiMessages.length - 1]?.duration,
        });
      } catch (error) {
        logger.error('Wiki operation tool execution failed', {
          error: error instanceof Error ? error.message : String(error),
          agentId: handlerContext.agent.id,
          toolParameters: toolMatch.parameters,
        });

        // Set up error response for next round
        if (!context.actions) {
          context.actions = {};
        }
        context.actions.yieldNextRoundTo = 'self';
        const errorMessage = `<functions_result>
Tool: wiki-operation
Error: ${error instanceof Error ? error.message : String(error)}
</functions_result>`;

        // Add error message to history BEFORE calling toolExecuted
        // Use the current time; order will be determined by save order
        const errorResultTime = new Date();
        const errorResultMessage: AgentInstanceMessage = {
          id: `tool-error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          agentId: handlerContext.agent.id,
          role: 'tool', // Tool error message
          content: errorMessage,
          modified: errorResultTime,
          duration: 2, // Error messages are visible to AI for 2 rounds: immediate + next round to allow explanation
          metadata: {
            isToolResult: true,
            isError: true,
            toolId: 'wiki-operation',
            isPersisted: false, // Required by messageManagementPlugin to identify new tool results
            isComplete: true, // Mark as complete to prevent messageManagementPlugin from overwriting content
          },
        };
        handlerContext.agent.messages.push(errorResultMessage);

        // Signal that tool was executed (with error) AFTER adding the message
        await hooks.toolExecuted.promise({
          handlerContext,
          toolResult: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          toolInfo: {
            toolId: 'wiki-operation',
            parameters: toolMatch.parameters || {},
          },
        });

        logger.debug('Wiki operation tool execution failed but error result added', {
          errorResultMessageId: errorResultMessage.id,
          aiMessageDuration: aiMessages[aiMessages.length - 1]?.duration,
        });
      }

      callback();
    } catch (error) {
      logger.error('Error in wiki operation plugin response handler', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback();
    }
  });
};
