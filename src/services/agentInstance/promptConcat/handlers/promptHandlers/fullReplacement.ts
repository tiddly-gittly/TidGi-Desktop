/**
 * Full replacement handler
 *
 * Replaces target content with content from a specified source
 */
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { logger } from '@services/libs/log';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import { Prompt, PromptDynamicModification } from '../../promptConcatSchema';

/**
 * Handler for dynamicModificationType: "fullReplacement"
 * Completely replaces target content with content from a specified source
 */
export function fullReplacementHandler(prompts: Prompt[], modification: PromptDynamicModification, context: PromptConcatContext): Prompt[] {
  if (!modification.fullReplacementParam) {
    logger.debug('Missing fullReplacementParam', {
      modificationType: 'fullReplacement',
      modificationId: modification.id,
    });
    return prompts;
  }

  const { targetId, sourceType } = modification.fullReplacementParam;
  const target = findPromptById(prompts, targetId);

  if (!target) {
    logger.warn('Target prompt not found for fullReplacement', {
      targetId,
      modificationId: modification.id,
    });
    return prompts;
  }

  // Get content based on source type
  let content = '';
  const [_userMessage, ...history] = context.messages;

  if (sourceType === 'historyOfSession' && history) {
    // Convert history messages to text
    content = history
      .map((message: AgentInstanceMessage) => {
        // Convert role from 'agent' to 'assistant' for compatibility
        const role = message.role === 'agent' ? 'assistant' : message.role;
        const text = message.content;
        return `${role}: ${text}`;
      })
      .join('\n\n');

    logger.debug('Full replacement with history', {
      targetId,
      historyLength: history.length,
      contentLength: content.length,
    });
  }

  // Update target prompt
  target.prompt.text = content;
  return prompts;
}
