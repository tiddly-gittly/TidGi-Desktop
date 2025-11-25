/**
 * Built-in plugins for prompt concatenation
 */
import { identity } from 'lodash';
import { z } from 'zod/v4';

import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { findPromptById } from '../promptConcat/promptConcat';
import type { IPrompt } from '../promptConcat/promptConcatSchema';
import { filterMessagesByDuration } from '../utilities/messageDurationFilter';
import { normalizeRole } from '../utilities/normalizeRole';
import { AgentResponse, PromptConcatTool, ResponseHookContext } from './types';

const t = identity;

/**
 * Full Replacement Parameter Schema
 * Configuration parameters for the full replacement plugin
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
}).meta({
  title: t('Schema.FullReplacement.Title'),
  description: t('Schema.FullReplacement.Description'),
});

/**
 * Dynamic Position Parameter Schema
 * Configuration parameters for the dynamic position plugin
 */
export const DynamicPositionParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.Position.TargetIdTitle'),
    description: t('Schema.Position.TargetId'),
  }),
  position: z.enum(['before', 'after', 'relative']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
  }),
}).meta({
  title: t('Schema.Position.Title'),
  description: t('Schema.Position.Description'),
});

/**
 * Type definitions
 */
export type FullReplacementParameter = z.infer<typeof FullReplacementParameterSchema>;
export type DynamicPositionParameter = z.infer<typeof DynamicPositionParameterSchema>;

/**
 * Get the full replacement parameter schema
 * @returns The schema for full replacement parameters
 */
export function getFullReplacementParameterSchema() {
  return FullReplacementParameterSchema;
}

/**
 * Get the dynamic position parameter schema
 * @returns The schema for dynamic position parameters
 */
export function getDynamicPositionParameterSchema() {
  return DynamicPositionParameterSchema;
}

/**
 * Full replacement plugin
 * Replaces target content with content from specified source
 */
export const fullReplacementTool: PromptConcatTool = (hooks) => {
  // Normalize an AgentInstanceMessage role to Prompt role
  hooks.processPrompts.tapAsync('fullReplacementTool', async (context, callback) => {
    const { toolConfig, prompts, messages } = context;

    if (toolConfig.toolId !== 'fullReplacement' || !toolConfig.fullReplacementParam) {
      callback();
      return;
    }

    const fullReplacementConfig = toolConfig.fullReplacementParam;
    if (!fullReplacementConfig) {
      callback();
      return;
    }

    const { targetId, sourceType } = fullReplacementConfig;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for fullReplacement', {
        targetId,
        toolId: toolConfig.id,
      });
      callback();
      return;
    }

    // Get all messages except the last user message being processed
    // We need to find and exclude only the current user message being processed, not just the last message
    const messagesCopy = cloneDeep(messages);

    // Find the last user message (which is the one being processed in this round)
    let lastUserMessageIndex = -1;
    for (let index = messagesCopy.length - 1; index >= 0; index--) {
      if (messagesCopy[index].role === 'user') {
        lastUserMessageIndex = index;
        break;
      }
    }

    // Remove only the last user message if found (this is the current message being processed)
    if (lastUserMessageIndex >= 0) {
      messagesCopy.splice(lastUserMessageIndex, 1);
      logger.debug('Removed current user message from history', {
        removedMessageId: messages[lastUserMessageIndex].id,
        remainingMessages: messagesCopy.length,
      });
    } else {
      logger.debug('No user message found to remove from history', {
        totalMessages: messagesCopy.length,
        messageRoles: messagesCopy.map(m => m.role),
      });
    }

    // Apply duration filtering to exclude expired messages from AI context
    const filteredHistory = filterMessagesByDuration(messagesCopy);

    switch (sourceType) {
      case 'historyOfSession':
        if (filteredHistory.length > 0) {
          // Insert filtered history messages as Prompt children (full Prompt type)
          found.prompt.children = [];
          filteredHistory.forEach((message, index: number) => {
            // Map AgentInstanceMessage role to Prompt role via normalizeRole
            type PromptRole = NonNullable<IPrompt['role']>;
            const role: PromptRole = normalizeRole(message.role);
            delete found.prompt.text;
            found.prompt.children!.push({
              id: `history-${index}`,
              caption: `History message ${index + 1}`,
              role,
              text: message.content,
            });
          });
        } else {
          found.prompt.text = '无聊天历史。';
        }
        break;
      case 'llmResponse':
        // This is handled in response phase
        break;
      default:
        logger.warn(`Unknown sourceType: ${sourceType as string}`);
        callback();
        return;
    }

    logger.debug('Full replacement completed in prompt phase', {
      targetId,
      sourceType,
    });

    callback();
  });

  // Handle response phase for llmResponse source type
  hooks.postProcess.tapAsync('fullReplacementTool', async (context, callback) => {
    const responseContext = context as ResponseHookContext;
    const { toolConfig, llmResponse, responses } = responseContext;

    if (toolConfig.toolId !== 'fullReplacement' || !toolConfig.fullReplacementParam) {
      callback();
      return;
    }

    const fullReplacementParameter = toolConfig.fullReplacementParam;
    if (!fullReplacementParameter) {
      callback();
      return;
    }

    const { targetId, sourceType } = fullReplacementParameter;

    // Only handle llmResponse in response phase
    if (sourceType !== 'llmResponse') {
      callback();
      return;
    }

    // Find the target response by ID
    const found = responses.find((r: AgentResponse) => r.id === targetId);

    if (!found) {
      logger.warn('Full replacement target not found in responses', {
        targetId,
        toolId: toolConfig.id,
      });
      callback();
      return;
    }

    // Replace target content with LLM response
    logger.debug('Replacing target with LLM response', {
      targetId,
      responseLength: llmResponse.length,
      toolId: toolConfig.id,
    });

    found.text = llmResponse;

    logger.debug('Full replacement completed in response phase', {
      targetId,
      sourceType,
      toolId: toolConfig.id,
    });

    callback();
  });
};

/**
 * Dynamic position plugin
 * Inserts content at a specific position relative to a target element
 */
export const dynamicPositionTool: PromptConcatTool = (hooks) => {
  hooks.processPrompts.tapAsync('dynamicPositionTool', async (context, callback) => {
    const { toolConfig, prompts } = context;

    if (toolConfig.toolId !== 'dynamicPosition' || !toolConfig.dynamicPositionParam || !toolConfig.content) {
      callback();
      return;
    }

    const dynamicPositionConfig = toolConfig.dynamicPositionParam;
    if (!dynamicPositionConfig) {
      callback();
      return;
    }

    const { targetId, position } = dynamicPositionConfig;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for dynamicPosition', {
        targetId,
        toolId: toolConfig.id,
      });
      callback();
      return;
    }

    // Create new prompt part
    const newPart: IPrompt = {
      id: `dynamic-${toolConfig.id}-${Date.now()}`,
      caption: toolConfig.caption || 'Dynamic Content',
      text: toolConfig.content,
    };

    // Insert based on position
    switch (position) {
      case 'before':
        found.parent.splice(found.index, 0, newPart);
        break;
      case 'after':
        found.parent.splice(found.index + 1, 0, newPart);
        break;
      case 'relative':
        // Simplified implementation, only adds to target's children
        if (!found.prompt.children) {
          found.prompt.children = [];
        }
        found.prompt.children.push(newPart);
        break;
      default:
        logger.warn(`Unknown position: ${position as string}`);
        callback();
        return;
    }

    logger.debug('Dynamic position insertion completed', {
      targetId,
      position,
      contentLength: toolConfig.content.length,
      toolId: toolConfig.id,
    });

    callback();
  });
};
