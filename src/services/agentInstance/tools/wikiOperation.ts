/**
 * Wiki Operation Tool
 * Handles wiki operation tool list injection, tool calling detection and response processing
 * Supports creating, updating, and deleting tiddlers in wiki workspaces
 */
import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

/**
 * Wiki Operation Config Schema (user-configurable in UI)
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

export type WikiOperationParameter = z.infer<typeof WikiOperationParameterSchema>;

export function getWikiOperationParameterSchema() {
  return WikiOperationParameterSchema;
}

/**
 * LLM-callable tool schema for wiki operations
 */
const WikiOperationToolSchema = z.object({
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
}).meta({
  title: 'wiki-operation',
  description: '在Wiki工作空间中执行操作（添加、删除或设置Tiddler文本）',
  examples: [
    { workspaceName: '我的知识库', operation: WikiChannel.addTiddler, title: '示例笔记', text: '示例内容', extraMeta: '{}', options: '{}' },
    { workspaceName: '我的知识库', operation: WikiChannel.setTiddlerText, title: '现有笔记', text: '更新后的内容', extraMeta: '{}', options: '{}' },
    { workspaceName: '我的知识库', operation: WikiChannel.deleteTiddler, title: '要删除的笔记', extraMeta: '{}', options: '{}' },
  ],
});

type WikiOperationToolParameters = z.infer<typeof WikiOperationToolSchema>;

/**
 * Execute wiki operation
 */
async function executeWikiOperation(parameters: WikiOperationToolParameters): Promise<ToolExecutionResult> {
  const { workspaceName, operation, title, text, extraMeta, options: optionsString } = parameters;

  try {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

    // Look up workspace
    const workspaces = await workspaceService.getWorkspacesAsList();
    const targetWorkspace = workspaces.find((ws) => ws.name === workspaceName || ws.id === workspaceName);

    if (!targetWorkspace) {
      return {
        success: false,
        error: i18n.t('Tool.WikiOperation.Error.WorkspaceNotFound', {
          workspaceName,
          availableWorkspaces: workspaces.map((w) => `${w.name} (${w.id})`).join(', '),
        }),
      };
    }

    const workspaceID = targetWorkspace.id;

    if (!(await workspaceService.exists(workspaceID))) {
      return {
        success: false,
        error: i18n.t('Tool.WikiOperation.Error.WorkspaceNotExist', { workspaceID }),
      };
    }

    const options = JSON.parse(optionsString || '{}') as Record<string, unknown>;

    logger.debug('Executing wiki operation', { workspaceID, workspaceName, operation, title });

    let result: string;

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
        return { success: false, error: `Unsupported operation: ${String(exhaustiveCheck)}` };
      }
    }

    return {
      success: true,
      data: result,
      metadata: { workspaceID, workspaceName, operation, title },
    };
  } catch (error) {
    logger.error('Wiki operation failed', { error, params: parameters });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wiki Operation Tool Definition
 */
const wikiOperationDefinition = registerToolDefinition({
  toolId: 'wikiOperation',
  displayName: 'Wiki Operation',
  description: 'Perform operations on wiki workspaces (create, update, delete tiddlers)',
  configSchema: WikiOperationParameterSchema,
  llmToolSchemas: {
    'wiki-operation': WikiOperationToolSchema,
  },

  onProcessPrompts({ config, toolConfig, injectToolList }) {
    const toolListPosition = config.toolListPosition;
    if (!toolListPosition?.targetId) return;

    injectToolList({
      targetId: toolListPosition.targetId,
      position: 'child', // Add as child of target prompt
      caption: 'Wiki Operation Tool',
    });

    logger.debug('Wiki operation tool list injected', {
      targetId: toolListPosition.targetId,
      position: toolListPosition.position,
      toolId: toolConfig.id,
    });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'wiki-operation') return;

    // Check cancellation
    if (agentFrameworkContext.isCancelled()) {
      logger.debug('Wiki operation cancelled', { agentId: agentFrameworkContext.agent.id });
      return;
    }

    await executeToolCall('wiki-operation', executeWikiOperation);
  },
});

export const wikiOperationTool = wikiOperationDefinition.tool;
