/* eslint-disable @typescript-eslint/require-await */
/**
 * Built-in plugins for prompt concatenation
 */
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { findPromptById } from '../promptConcat/promptConcat';
import { IPrompt } from '../promptConcat/promptConcatSchema';
import { AgentResponse, ResponseHookContext, PromptConcatPlugin } from './types';

/**
 * Full replacement plugin
 * Replaces target content with content from specified source
 */
export const fullReplacementPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('fullReplacementPlugin', async (context, callback) => {
    const { pluginConfig, prompts, messages } = context;

    if (pluginConfig.pluginId !== 'fullReplacement' || !pluginConfig.fullReplacementParam) {
      callback();
      return;
    }

    const fullReplacementConfig = pluginConfig.fullReplacementParam;
    const { targetId, sourceType } = fullReplacementConfig;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for fullReplacement', {
        targetId,
        pluginId: pluginConfig.id,
      });
      callback();
      return;
    }

    // Get all messages except the last one which is the user message
    const messagesCopy = cloneDeep(messages);
    messagesCopy.pop(); // Last message is the user message
    const history = messagesCopy; // Remaining messages are history

    switch (sourceType) {
      case 'historyOfSession':
        if (history.length > 0) {
          // Insert history messages as Prompt children (full Prompt type)
          found.prompt.children = [];
          history.forEach((message, index: number) => {
            // Use the role type from Prompt
            type PromptRole = NonNullable<IPrompt['role']>;
            const role: PromptRole = message.role === 'agent'
              ? 'assistant'
              : message.role === 'user'
              ? 'user'
              : 'assistant';
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
  hooks.postProcess.tapAsync('fullReplacementPlugin', async (context, callback) => {
    const responseContext = context as ResponseHookContext;
    const { pluginConfig, llmResponse, responses } = responseContext;

    if (pluginConfig.pluginId !== 'fullReplacement' || !pluginConfig.fullReplacementParam) {
      callback();
      return;
    }

    const { targetId, sourceType } = pluginConfig.fullReplacementParam;

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
        pluginId: pluginConfig.id,
      });
      callback();
      return;
    }

    // Replace target content with LLM response
    logger.debug('Replacing target with LLM response', {
      targetId,
      responseLength: llmResponse.length,
      pluginId: pluginConfig.id,
    });

    found.text = llmResponse;

    logger.debug('Full replacement completed in response phase', {
      targetId,
      sourceType,
    });

    callback();
  });
};

/**
 * Dynamic position plugin
 * Inserts content at a specific position relative to a target element
 */
export const dynamicPositionPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('dynamicPositionPlugin', async (context, callback) => {
    const { pluginConfig, prompts } = context;

    if (pluginConfig.pluginId !== 'dynamicPosition' || !pluginConfig.dynamicPositionParam || !pluginConfig.content) {
      callback();
      return;
    }

    const dynamicPositionConfig = pluginConfig.dynamicPositionParam;
    const { targetId, position } = dynamicPositionConfig;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for dynamicPosition', {
        targetId,
        pluginId: pluginConfig.id,
      });
      callback();
      return;
    }

    // Create new prompt part
    const newPart: IPrompt = {
      id: `dynamic-${pluginConfig.id}-${Date.now()}`,
      caption: pluginConfig.caption || 'Dynamic Content',
      text: pluginConfig.content,
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
      contentLength: pluginConfig.content.length,
    });

    callback();
  });
};

/**
 * Model Context Protocol plugin
 * Integrates with external MCP servers
 */
export const modelContextProtocolPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('modelContextProtocolPlugin', async (context, callback) => {
    const { pluginConfig, prompts } = context;

    if (pluginConfig.pluginId !== 'modelContextProtocol' || !pluginConfig.modelContextProtocolParam) {
      callback();
      return;
    }

    const parameter = pluginConfig.modelContextProtocolParam;
    const { targetId, position, id, timeoutSecond = 10, timeoutMessage = 'MCP server call timed out' } = parameter;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for modelContextProtocol', {
        targetId,
        pluginId: pluginConfig.id,
      });
      callback();
      return;
    }

    try {
      // TODO: Implement actual MCP server call with timeout
      // For now, create a placeholder that indicates MCP integration
      const content = `MCP Server Call: ${id}
Timeout: ${timeoutSecond} seconds
Timeout Message: ${timeoutMessage}

This is where the actual Model Context Protocol server would be called.
The MCP server would provide additional context or capabilities to the AI model.`;

      // Simulate timeout handling in future implementation
      logger.debug('MCP plugin - simulating server call', {
        mcpId: id,
        timeout: timeoutSecond,
        pluginId: pluginConfig.id,
      });

      const newPart: IPrompt = {
        id: `mcp-${pluginConfig.id}-${Date.now()}`,
        caption: pluginConfig.caption || 'MCP Content',
        text: content,
      };

      // Insert based on position
      switch (position) {
        case 'before':
          found.parent.splice(found.index, 0, newPart);
          break;
        case 'after':
          found.parent.splice(found.index + 1, 0, newPart);
          break;
        default:
          logger.warn(`Unknown position: ${position as string}`);
          callback();
          return;
      }

      logger.debug('MCP plugin completed', {
        targetId,
        position,
        mcpId: id,
      });

      callback();
    } catch (error) {
      logger.error('MCP plugin error', error);
      callback();
    }
  });
};
