/**
 * Retrieval Augmented Generation handler
 * Now handles both tool prompt injection and result extraction from messages
 * This handler is registered to process retrievalAugmentedGeneration dynamic modifications
 */
import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { AgentToolResult, WikiSearchTool } from '../../../buildInAgentTools';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import type { Prompt, PromptDynamicModification, RetrievalAugmentedGenerationParameter } from '../../promptConcatSchema';

/**
 * Checks if a trigger condition matches the current context
 * @param trigger The trigger condition to check
 * @param context The agent handler context
 * @returns Whether the trigger condition matches
 */
function checkTriggerCondition(
  trigger: RetrievalAugmentedGenerationParameter['trigger'],
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
 * Inject tool list and wiki information into prompts
 */
async function injectToolListPrompt(
  prompts: Prompt[],
  toolListPosition: NonNullable<RetrievalAugmentedGenerationParameter['toolListPosition']>,
  workspaceService: IWorkspaceService,
  agentDefinitionService: IAgentDefinitionService,
  context: PromptConcatContext,
  modification: PromptDynamicModification,
): Promise<void> {
  const toolListTarget = findPromptById(prompts, toolListPosition.targetId);
  if (!toolListTarget) return;

  // Get available wikis
  try {
    const workspaces = await workspaceService.getWorkspacesAsList();
    const wikiWorkspaces = workspaces.filter(isWikiWorkspace);

    // Get wiki search tool information
    const availableTools = await agentDefinitionService.getAvailableTools();
    const wikiSearchTool = availableTools.find(tool => tool.id === 'wiki-search');

    let toolPromptContent = '';

    // Add wiki information
    if (wikiWorkspaces.length > 0) {
      toolPromptContent += 'Available Wiki Workspaces:\n';
      for (const workspace of wikiWorkspaces) {
        toolPromptContent += `- ${workspace.name} (ID: ${workspace.id})\n`;
      }
      toolPromptContent += '\n';
    }

    // Add tool information
    if (wikiSearchTool) {
      toolPromptContent += 'Available Tools:\n';
      toolPromptContent += `- ${wikiSearchTool.name}: ${wikiSearchTool.description}\n`;
      toolPromptContent += 'Usage example:\n';
      toolPromptContent += '<tool_use name="wiki-search">\n';
      toolPromptContent += '{\n';
      toolPromptContent += '  "workspaceName": "workspace-id",\n';
      toolPromptContent += '  "filter": "[tag[example]]",\n';
      toolPromptContent += '  "maxResults": 5\n';
      toolPromptContent += '}\n';
      toolPromptContent += '</tool_use>\n';
    }

    if (toolPromptContent.trim()) {
      const toolPrompt: Prompt = {
        id: `tool-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: toolPromptContent,
        tags: ['toolList', 'retrievalAugmentedGeneration'],
        caption: 'Available tools and wikis',
        enabled: true,
        source: context.sourcePaths?.get(modification.id),
      };

      // Insert at specified position
      if (toolListPosition.position === 'before') {
        toolListTarget.parent.splice(toolListTarget.index, 0, toolPrompt);
      } else if (toolListPosition.position === 'after') {
        toolListTarget.parent.splice(toolListTarget.index + 1, 0, toolPrompt);
      } else {
        toolListTarget.parent.splice(toolListTarget.index + 1, 0, toolPrompt);
      }

      logger.debug('Tool list prompt inserted successfully', {
        targetId: toolListPosition.targetId,
        toolCount: availableTools.length,
        wikiCount: wikiWorkspaces.length,
      });
    }
  } catch (error) {
    logger.error('Error getting workspaces for tool list', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Extract tool results from messages and inject into prompts
 */
function injectToolResultPrompt(
  prompts: Prompt[],
  resultPosition: NonNullable<RetrievalAugmentedGenerationParameter['resultPosition']>,
  context: PromptConcatContext,
  modification: PromptDynamicModification,
): void {
  const resultTarget = findPromptById(prompts, resultPosition.targetId);
  if (!resultTarget) return;

  // Find the latest tool calling result in messages
  const toolResultMessages = context.messages
    .filter(m => m.metadata && m.metadata.sourceType === 'toolCalling' && m.metadata.toolId === 'wiki-search')
    .sort((a, b) => new Date(b.modified || 0).getTime() - new Date(a.modified || 0).getTime());

  if (toolResultMessages.length > 0) {
    const latestToolResult = toolResultMessages[0];
    const resultData = latestToolResult.metadata?.toolResult;

    let resultContent = '';
    if (resultData && typeof resultData === 'object' && 'success' in resultData && 'data' in resultData) {
      if (resultData.success) {
        resultContent = WikiSearchTool.formatResultsAsText(resultData as unknown as AgentToolResult);
      } else {
        resultContent = `Tool execution failed: ${(resultData as { error?: string }).error || 'Unknown error'}`;
      }
    } else {
      resultContent = 'Tool execution result format error';
    }

    if (resultContent.trim()) {
      const resultPrompt: Prompt = {
        id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: resultContent,
        tags: ['toolResult', 'retrievalAugmentedGeneration'],
        caption: 'Tool execution result',
        enabled: true,
        source: context.sourcePaths?.get(modification.id),
      };

      // Insert at specified position
      if (resultPosition.position === 'before') {
        resultTarget.parent.splice(resultTarget.index, 0, resultPrompt);
      } else if (resultPosition.position === 'after') {
        resultTarget.parent.splice(resultTarget.index + 1, 0, resultPrompt);
      } else {
        resultTarget.parent.splice(resultTarget.index + 1, 0, resultPrompt);
      }

      logger.debug('Tool result prompt inserted successfully', {
        targetId: resultPosition.targetId,
        resultLength: resultContent.length,
        toolId: latestToolResult.metadata?.toolId,
      });
    }
  }
}

/**
 * Handler for retrievalAugmentedGeneration
 * Handles two main functions:
 * 1. Inject tool list and wiki information at toolListPosition
 * 2. Extract tool results from messages and insert at resultPosition
 *
 * @param prompts - Array of prompts that will be sent to AI, can be modified to insert content at specific positions
 * @param modification - JSON configuration object created from schema, contains parameters for retrieval and insertion
 * @param context - Processing context containing conversation history including previous AI responses for tool matching
 * @returns Modified prompts array with tool information and results inserted
 */
export async function retrievalAugmentedGenerationHandler(
  prompts: Prompt[],
  modification: PromptDynamicModification,
  context: PromptConcatContext,
): Promise<Prompt[]> {
  if (!modification.retrievalAugmentedGenerationParam) {
    logger.warn('retrievalAugmentedGeneration handler called without parameters', { handler: 'retrievalAugmentedGenerationHandler' });
    return prompts;
  }

  const {
    toolListPosition,
    resultPosition,
    trigger,
  } = modification.retrievalAugmentedGenerationParam;

  try {
    // Check if trigger condition is met
    const shouldTrigger = checkTriggerCondition(trigger, context);
    if (!shouldTrigger) {
      logger.debug('Trigger condition not met, skipping RAG', {
        triggerId: modification.id,
        handler: 'retrievalAugmentedGenerationHandler',
      });
      return prompts;
    }

    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const agentDefinitionService = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);

    // 1. Inject tool list and wiki information if toolListPosition is specified
    if (toolListPosition?.targetId) {
      await injectToolListPrompt(prompts, toolListPosition, workspaceService, agentDefinitionService, context, modification);
    }

    // 2. Extract and inject tool results if resultPosition is specified
    if (resultPosition?.targetId) {
      injectToolResultPrompt(prompts, resultPosition, context, modification);
    }

    return prompts;
  } catch (error) {
    logger.error('Error in retrievalAugmentedGenerationHandler', {
      error: error instanceof Error ? error.message : String(error),
      handler: 'retrievalAugmentedGenerationHandler',
      modificationId: modification.id,
    });
    return prompts;
  }
}
