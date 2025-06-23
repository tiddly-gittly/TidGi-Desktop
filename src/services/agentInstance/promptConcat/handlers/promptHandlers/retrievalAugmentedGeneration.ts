/**
 * Retrieval Augmented Generation handler
 * Now handles both tool prompt injection and result extraction from messages
 * This handler is registered to process retrievalAugmentedGeneration dynamic modifications
 */
import { WikiChannel } from '@/constants/channels';
import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

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
      const workspaceList = wikiWorkspaces.map(workspace => `- ${workspace.name} (ID: ${workspace.id})`).join('\n');
      toolPromptContent += `Available Wiki Workspaces:\n${workspaceList}\n\n`;
    }

    // Add tool information with optimized schema
    if (wikiSearchTool) {
      toolPromptContent += `Available Tools:
- ${wikiSearchTool.name}: ${wikiSearchTool.description}

${wikiSearchTool.schema.description ? `Description: ${wikiSearchTool.schema.description}\n` : ''}${
        wikiSearchTool.schema.parameters ? `Parameters: ${wikiSearchTool.schema.parameters}` : 'No parameters'
      }
`;
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
async function injectToolResultPrompt(
  prompts: Prompt[],
  resultPosition: NonNullable<RetrievalAugmentedGenerationParameter['resultPosition']>,
  wikiParameter: RetrievalAugmentedGenerationParameter['wikiParam'],
  context: PromptConcatContext,
  modification: PromptDynamicModification,
): Promise<void> {
  const resultTarget = findPromptById(prompts, resultPosition.targetId);
  if (!resultTarget) return;

  // Check if we have wiki parameters to execute filter
  if (!wikiParameter?.workspaceName || !wikiParameter.filter) {
    logger.debug('No wiki parameters provided for tool result injection', {
      wikiParameter,
      targetId: resultPosition.targetId,
    });
    return;
  }

  try {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

    // Execute the filter in the specified wiki workspace
    const resultContent = await wikiService.wikiOperationInServer(
      WikiChannel.runFilter,
      wikiParameter.workspaceName,
      [wikiParameter.filter],
    );

    // Check if we have results (wikiOperationInServer returns string[])
    if (Array.isArray(resultContent) && resultContent.length > 0) {
      // Join the results into a single string
      const contentText = resultContent.join('\n');

      const resultPrompt: Prompt = {
        id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: `Wiki search results from "${wikiParameter.workspaceName}" with filter "${wikiParameter.filter}":\n\n${contentText}`,
        tags: ['toolResult', 'retrievalAugmentedGeneration'],
        caption: 'Wiki search result',
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

      logger.debug('Wiki search result prompt inserted successfully', {
        targetId: resultPosition.targetId,
        workspaceName: wikiParameter.workspaceName,
        filter: wikiParameter.filter,
        resultCount: resultContent.length,
        contentLength: contentText.length,
      });
    } else {
      logger.debug('No results found from wiki filter', {
        workspaceName: wikiParameter.workspaceName,
        filter: wikiParameter.filter,
      });
    }
  } catch (error) {
    logger.error('Error executing wiki filter for tool result', {
      error: error instanceof Error ? error.message : String(error),
      workspaceName: wikiParameter.workspaceName,
      filter: wikiParameter.filter,
      targetId: resultPosition.targetId,
    });
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
    wikiParam,
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
      await injectToolResultPrompt(prompts, resultPosition, wikiParam, context, modification);
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
