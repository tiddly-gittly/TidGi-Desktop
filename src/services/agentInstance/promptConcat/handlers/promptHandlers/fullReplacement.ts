/**
 * Full replacement handler
 *
 * Replaces target content with content from a specified source
 */
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import { IPrompt, PromptDynamicModification } from '../../promptConcatSchema';

/**
 * Handler for dynamicModificationType: "fullReplacement"
 * Completely replaces target content with content from a specified source
 */
export function fullReplacementHandler(prompts: IPrompt[], modification: PromptDynamicModification, context: PromptConcatContext): IPrompt[] {
  if (!modification.fullReplacementParam) {
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
  // Get all messages except the last one which is the user message
  const messages = cloneDeep(context.messages);
  messages.pop(); // Last message is the user message
  const history = messages; // Remaining messages are history
  if (sourceType === 'historyOfSession' && history.length > 0) {
    // Insert history messages as Prompt children (full Prompt type)
    target.prompt.children = [];
    history.forEach((message: AgentInstanceMessage, idx: number) => {
      // Use the role type from Prompt
      type PromptRole = NonNullable<IPrompt['role']>;
      let role: PromptRole =
        message.role === 'agent' ? 'assistant'
        : message.role === 'user' ? 'user'
        : 'assistant';
      delete target.prompt.text;
      target.prompt.children!.push({
        id: `history-${idx}`,
        caption: `History message ${idx + 1}`,
        role,
        text: message.content
      } as IPrompt);
    });
  }
  return prompts;
}
