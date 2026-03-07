/**
 * Full Replacement Modifier
 *
 * Replaces target prompt content with content from specified source.
 * Supports: historyOfSession, llmResponse
 */
import { logger } from '@services/libs/log';
import { cloneDeep, identity } from 'lodash';
import { z } from 'zod/v4';
import type { AgentResponse } from '../../tools/types';
import { filterMessagesByDuration } from '../../utilities/messageDurationFilter';
import { normalizeRole } from '../../utilities/normalizeRole';
import { estimateTokens } from '../../utilities/tokenEstimator';
import type { IPrompt } from '../promptConcatSchema';
import { registerModifier } from './defineModifier';

const t = identity;

/**
 * Full Replacement Parameter Schema
 */
export const FullReplacementParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.FullReplacement.TargetIdTitle'),
    description: t('Schema.FullReplacement.TargetId'),
  }),
  sourceType: z.enum(['historyOfSession', 'llmResponse']).meta({
    title: t('Schema.FullReplacement.SourceTypeTitle'),
    description: t('Schema.FullReplacement.SourceType'),
  }),
  contextWindowSize: z.number().optional().meta({
    title: 'Context Window Size',
    description: 'Max tokens for message history. Oldest messages are trimmed when exceeded. 0 or empty = no limit.',
  }),
}).meta({
  title: t('Schema.FullReplacement.Title'),
  description: t('Schema.FullReplacement.Description'),
});

export type FullReplacementParameter = z.infer<typeof FullReplacementParameterSchema>;

export function getFullReplacementParameterSchema() {
  return FullReplacementParameterSchema;
}

/**
 * Full Replacement Modifier Definition
 */
const fullReplacementDefinition = registerModifier({
  modifierId: 'fullReplacement',
  displayName: 'Full Replacement',
  description: 'Replace target content with content from specified source',
  configSchema: FullReplacementParameterSchema,

  onProcessPrompts({ config, modifierConfig, findPrompt, messages }) {
    const { targetId, sourceType } = config;
    const found = findPrompt(targetId);

    if (!found) {
      logger.warn('Target prompt not found for fullReplacement', {
        targetId,
        modifierId: modifierConfig.id,
      });
      return;
    }

    // Only handle historyOfSession in processPrompts phase
    if (sourceType !== 'historyOfSession') {
      return;
    }

    // Get all messages except the last user message being processed
    const messagesCopy = cloneDeep(messages);

    // Find and remove the last user message (which is being processed in this round)
    let lastUserMessageIndex = -1;
    for (let index = messagesCopy.length - 1; index >= 0; index--) {
      if (messagesCopy[index].role === 'user') {
        lastUserMessageIndex = index;
        break;
      }
    }

    if (lastUserMessageIndex >= 0) {
      messagesCopy.splice(lastUserMessageIndex, 1);
      logger.debug('Removed current user message from history', {
        removedMessageId: messages[lastUserMessageIndex].id,
        remainingMessages: messagesCopy.length,
      });
    }

    // Apply duration filtering to exclude expired messages
    const filteredHistory = filterMessagesByDuration(messagesCopy);

    // Apply context window token trimming — remove oldest messages when total exceeds limit
    const contextWindowSize = config.contextWindowSize;
    let trimmedHistory = filteredHistory;
    if (contextWindowSize && contextWindowSize > 0 && filteredHistory.length > 0) {
      let totalTokens = 0;
      for (const message of filteredHistory) {
        totalTokens += estimateTokens(message.content);
      }
      // Reserve ~30% of context window for system prompts + tool definitions + current user message
      const historyBudget = Math.floor(contextWindowSize * 0.7);
      if (totalTokens > historyBudget) {
        // Remove from the front (oldest) until we fit
        trimmedHistory = [];
        let runningTokens = 0;
        for (let index = filteredHistory.length - 1; index >= 0; index--) {
          const messageTokens = estimateTokens(filteredHistory[index].content);
          if (runningTokens + messageTokens > historyBudget) break;
          runningTokens += messageTokens;
          trimmedHistory.unshift(filteredHistory[index]);
        }
        logger.debug('Trimmed history to fit context window', {
          originalMessages: filteredHistory.length,
          trimmedMessages: trimmedHistory.length,
          totalTokensBefore: totalTokens,
          totalTokensAfter: runningTokens,
          historyBudget,
        });
      }
    }

    if (trimmedHistory.length > 0) {
      found.prompt.children = [];
      trimmedHistory.forEach((message, index: number) => {
        type PromptRole = NonNullable<IPrompt['role']>;
        const role: PromptRole = normalizeRole(message.role);
        delete found.prompt.text;

        // Check if message has an image attachment
        const hasImage = Boolean((message.metadata as { file?: { path?: string } })?.file?.path);

        if (hasImage) {
          // For messages with images, create a child prompt that will be processed by infrastructure
          found.prompt.children!.push({
            id: `history-${index}`,
            caption: `History message ${index + 1}`,
            role,
            text: message.content,
            // Preserve file metadata so it can be loaded by messagePersistence
            ...(message.metadata?.file
              ? {
                file: message.metadata.file as unknown as Record<string, unknown>,
              }
              : {}),
          });
        } else {
          // For text-only messages, just add the text
          found.prompt.children!.push({
            id: `history-${index}`,
            caption: `History message ${index + 1}`,
            role,
            text: message.content,
          });
        }
      });
    } else {
      found.prompt.text = '无聊天历史。';
    }

    logger.debug('Full replacement completed in prompt phase', { targetId, sourceType });
  },

  onPostProcess({ config, modifierConfig, llmResponse, responses }) {
    const { targetId, sourceType } = config;

    if (sourceType !== 'llmResponse') {
      return;
    }

    if (!responses) {
      logger.warn('No responses available in postProcess phase', {
        targetId,
        modifierId: modifierConfig.id,
      });
      return;
    }

    const found = responses.find((r: AgentResponse) => r.id === targetId);

    if (!found) {
      logger.warn('Full replacement target not found in responses', {
        targetId,
        modifierId: modifierConfig.id,
      });
      return;
    }

    found.text = llmResponse;

    logger.debug('Full replacement completed in response phase', {
      targetId,
      sourceType,
      modifierId: modifierConfig.id,
    });
  },
});

export const fullReplacementModifier = fullReplacementDefinition.modifier;
