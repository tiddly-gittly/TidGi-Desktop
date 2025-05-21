/**
 * JavaScript Tool handler
 *
 * Loads and executes a JavaScript tool at the specified position
 */
import { logger } from '@services/libs/log';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import { Prompt, PromptDynamicModification, PromptPart } from '../../promptConcatSchema';
import { loadContentFromUri } from '../shared/utilities';

/**
 * Handler for dynamicModificationType: "javascriptTool"
 * Loads and executes a JavaScript tool at the specified position
 */
export function javascriptToolHandler(prompts: Prompt[], modification: PromptDynamicModification, _context: PromptConcatContext): Prompt[] {
  if (!modification.javascriptToolParam) {
    logger.debug('Missing javascriptToolParam', {
      modificationType: 'javascriptTool',
      modificationId: modification.id,
    });
    return prompts;
  }

  const parameter = modification.javascriptToolParam;
  const { targetId, position, uri } = parameter;
  const target = findPromptById(prompts, targetId);

  if (!target) {
    logger.warn('Target prompt not found for javascriptTool', {
      targetId,
      modificationId: modification.id,
    });
    return prompts;
  }

  logger.debug('Loading JavaScript tool', {
    uri,
    position,
  });

  // Load JavaScript tool content
  loadContentFromUri(uri)
    .then(content => {
      if (!content) {
        logger.warn('No content loaded from JavaScript tool URI', { uri });
        return;
      }

      // Create new prompt part
      const newPart: PromptPart = {
        id: `js-tool-${Date.now()}`,
        text: content,
      };

      // Insert content based on position
      if (position === 'before') {
        target.parent.splice(target.index, 0, newPart);
      } else if (position === 'after') {
        target.parent.splice(target.index + 1, 0, newPart);
      } else if (position === 'relative') {
        if (!target.prompt.children) {
          target.prompt.children = [];
        }
        target.prompt.children.push(newPart);
      }
    })
    .catch((error: unknown) => {
      logger.error('Error loading JavaScript tool', {
        error: error instanceof Error ? error.message : String(error),
        uri,
      });
    });

  return prompts;
}
