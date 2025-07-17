/**
 * Retrieval Augmented Generation handler
 * Simplified to only handle tool list injection
 * Tool execution results are now handled via message history in basicPromptConcatHandler
 */
import { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

import { findPromptById, PromptConcatContext } from '../../promptConcat';
import type { IPrompt, PromptDynamicModification, RetrievalAugmentedGenerationParameter } from '../../promptConcatSchema';

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
  prompts: IPrompt[],
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
      toolPromptContent += `Available Tools:\n- Tool ID: ${wikiSearchTool.id}\n- Tool Name: ${wikiSearchTool.name}\n\n${wikiSearchTool.schema.description ? `Description: ${wikiSearchTool.schema.description}\n` : ''}${
        wikiSearchTool.schema.parameters ? `Parameters: ${wikiSearchTool.schema.parameters}` : 'No parameters'
      }`;
    }

    if (toolPromptContent.trim()) {
      const toolPrompt: IPrompt = {
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
        injectedToolId: wikiSearchTool?.id,
        promptLength: toolPromptContent.length,
      });
    }
  } catch (error) {
    logger.error('Error getting workspaces for tool list', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handler for retrievalAugmentedGeneration
 * Now simplified to only handle tool list injection
 * Tool execution results are handled via message history in basicPromptConcatHandler
 *
 * @param prompts - Array of prompts that will be sent to AI, can be modified to insert content at specific positions
 * @param modification - JSON configuration object created from schema, contains parameters for retrieval and insertion
 * @param context - Processing context containing conversation history including previous AI responses for tool matching
 * @returns Modified prompts array with tool information inserted
 */
export async function retrievalAugmentedGenerationHandler(
  prompts: IPrompt[],
  modification: PromptDynamicModification,
  context: PromptConcatContext,
): Promise<IPrompt[]> {
  if (!modification.retrievalAugmentedGenerationParam) {
    logger.warn('retrievalAugmentedGeneration handler called without parameters', { handler: 'retrievalAugmentedGenerationHandler' });
    return prompts;
  }

  const {
    toolListPosition,
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

    // Only inject tool list and wiki information if toolListPosition is specified
    if (toolListPosition?.targetId) {
      await injectToolListPrompt(prompts, toolListPosition, workspaceService, agentDefinitionService, context, modification);
    }

    // Tool result injection is no longer handled here - it's now done via message history
    // in basicPromptConcatHandler when tools are actually executed

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
