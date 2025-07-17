/**
 * Dynamic position handler
 *
 * Inserts content at a specific position relative to a target element
 */
import { logger } from '@services/libs/log';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import { IPrompt, PromptDynamicModification } from '../../promptConcatSchema';

/**
 * Handler for dynamicModificationType: "dynamicPosition"
 * Inserts content at a specific position relative to a target element
 */
export function dynamicPositionHandler(prompts: IPrompt[], modification: PromptDynamicModification, context: PromptConcatContext): IPrompt[] {
  if (!modification.dynamicPositionParam || !modification.content) {
    logger.debug('Missing dynamicPositionParam or content', {
      modificationType: 'dynamicPosition',
      modificationId: modification.id,
      hasParam: !!modification.dynamicPositionParam,
      hasContent: !!modification.content,
    });
    return prompts;
  }

  const { targetId, position } = modification.dynamicPositionParam;
  const target = findPromptById(prompts, targetId);

  if (!target) {
    logger.warn('Target prompt not found for dynamicPosition', {
      targetId,
      modificationId: modification.id,
    });
    return prompts;
  }

  // Create new prompt part
  const newPart: IPrompt = {
    id: `dynamic-${Date.now()}`,
    caption: 'Dynamic Content',
    text: modification.content,
    source: context.sourcePaths?.get(modification.id),
  };

  logger.debug('Inserting dynamic content', {
    position,
    targetId,
    contentLength: modification.content.length,
  });

  // Insert based on position
  if (position === 'before') {
    target.parent.splice(target.index, 0, newPart);
  } else if (position === 'after') {
    target.parent.splice(target.index + 1, 0, newPart);
  } else if (position === 'relative') {
    // Simplified implementation, only adds to target's children
    if (!target.prompt.children) {
      target.prompt.children = [];
    }
    target.prompt.children.push(newPart);
  }

  return prompts;
}
