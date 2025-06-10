/**
 * Retrieval Augmented Generation handler
 * Integrates with Wiki service t    logger.warn('Missing wikiParam in retrievalAugmentedGeneration', { handler: 'retrievalAugmentedGenerationHandler' });
    return prompts;
  }

  // Check if trigger condition is metrieve content from TiddlyWiki
 * This handler is registered to process retrievalAugmentedGeneration dynamic modifications
 */
import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import type { Prompt, PromptDynamicModification, RetrievalAugmentedGenerationParameter } from '../../promptConcatSchema';

/**
 * Checks if a trigger condition matches the current context
 * @param trigger The trigger condition to check
 * @param context The agent handler context
 * @returns Whether the trigger condition matches
 */
async function checkTriggerCondition(
  trigger: RetrievalAugmentedGenerationParameter['trigger'],
  context: PromptConcatContext,
): Promise<boolean> {
  if (!trigger) {
    return true; // No trigger defined, always apply
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

  // Check filter trigger - will be handled by Wiki service separately

  return false;
}

/**
 * Handler for retrievalAugmentedGeneration
 * Retrieves content from TiddlyWiki based on filter expressions
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
    wikiParam,
    trigger,
    position,
    targetId,
  } = modification.retrievalAugmentedGenerationParam;

  // Only support wiki source type for now
  if (!wikiParam) {
    logger.warn(`Missing wikiParam in retrievalAugmentedGeneration`);
    return prompts;
  }

  // Check if trigger condition is met
  try {
    const shouldTrigger = await checkTriggerCondition(trigger, context);
    if (!shouldTrigger) {
      logger.debug('retrievalAugmentedGeneration trigger condition not met', { handler: 'retrievalAugmentedGenerationHandler' });
      return prompts;
    }
  } catch (error) {
    logger.error('Error checking trigger condition', {
      error: error instanceof Error ? error.message : String(error),
      triggerId: modification.id,
      handler: 'retrievalAugmentedGenerationHandler',
    });
    return prompts;
  }

  // Get Wiki service
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const { workspaceName, filter } = wikiParam;

  if (!workspaceName || !filter) {
    logger.warn('Missing workspaceName or filter in wikiParam', { wikiParam, handler: 'retrievalAugmentedGenerationHandler' });
    return prompts;
  }

  try {
    // Look up workspace ID from workspace name
    // For now, assuming workspaceName is actually the workspaceID
    // In a real implementation, you'd lookup the workspace ID by name
    const workspaceID = workspaceName;
    if (!await workspaceService.exists(workspaceID)) {
      logger.warn(`Workspace ${workspaceID} does not exist`, { workspaceID, handler: 'retrievalAugmentedGenerationHandler' });
      return prompts;
    }

    logger.debug('Retrieving content from Wiki', {
      workspaceID,
      filter,
      handler: 'retrievalAugmentedGenerationHandler',
    });

    // Retrieve tiddlers using the filter expression
    const tiddlers = await wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, [filter]);

    if (tiddlers.length === 0) {
      logger.debug('No tiddlers found with filter', { filter, handler: 'retrievalAugmentedGenerationHandler' });
      return prompts;
    }

    logger.debug(`Found ${tiddlers.length} tiddlers`, {
      tiddlerTitles: tiddlers.slice(0, 5), // Log only first 5 titles for brevity
      handler: 'retrievalAugmentedGenerationHandler',
    });

    // Retrieve full tiddler content for each tiddler
    const tiddlerContents: ITiddlerFields[] = [];
    for (const title of tiddlers) {
      try {
        const tiddlerFields = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [title]);
        if (tiddlerFields.length > 0) {
          tiddlerContents.push(tiddlerFields[0]);
        }
      } catch (error) {
        logger.warn(`Error retrieving tiddler content for ${title}`, {
          error: error instanceof Error ? error.message : String(error),
          handler: 'retrievalAugmentedGenerationHandler',
        });
      }
    }

    if (tiddlerContents.length === 0) {
      logger.debug('No tiddler contents could be retrieved', { handler: 'retrievalAugmentedGenerationHandler' });
      return prompts;
    }

    // Format tiddler content as a string
    let content = '';
    for (const tiddler of tiddlerContents) {
      content += `# ${tiddler.title}\n\n${tiddler.text || ''}\n\n`;
    }

    // Find the target position for insertion
    const target = findPromptById(prompts, targetId);

    if (!target) {
      logger.warn(`Target ${targetId} not found for retrievalAugmentedGeneration`, { handler: 'retrievalAugmentedGenerationHandler' });
      return prompts;
    }

    // Create new prompt part with the retrieved content
    const newPart: Prompt = {
      id: `rag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: content,
      tags: ['retrievalAugmentedGeneration'],
      caption: 'Retrieved content',
      enabled: true,
      source: context.sourcePaths?.get(modification.id),
    };

    // Insert the content at the target position
    if (position === 'before') {
      target.parent.splice(target.index, 0, newPart);
    } else if (position === 'after') {
      target.parent.splice(target.index + 1, 0, newPart);
    } else if (position === 'relative') {
      // Handle relative positions (top, bottom)
      // For simplicity, just insert after for now
      target.parent.splice(target.index + 1, 0, newPart);
    }

    logger.info('Successfully added retrievalAugmentedGeneration content', {
      contentLength: content.length,
      targetId,
      position,
      handler: 'retrievalAugmentedGenerationHandler',
    });

    return prompts;
  } catch (error) {
    logger.error('Error in retrievalAugmentedGeneration handler', {
      error: error instanceof Error ? error.message : String(error),
      workspaceName,
      filter,
      handler: 'retrievalAugmentedGenerationHandler',
    });
    return prompts;
  }
}
