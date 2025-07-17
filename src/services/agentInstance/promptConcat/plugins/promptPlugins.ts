/**
 * Built-in plugins for prompt concatenation
 */
import { logger } from '@services/libs/log';
import { cloneDeep } from 'lodash';
import { PromptConcatPlugin, PromptConcatHookContext } from './index';
import { findPromptById } from '../promptConcat';
import { IPrompt } from '../promptConcatSchema';
import { AgentResponse, ResponseHookContext } from './responsePlugins';

/**
 * Full replacement plugin
 * Replaces target content with content from specified source
 */
export const fullReplacementPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('fullReplacementPlugin', async (context, callback) => {
    const { plugin, prompts, messages } = context;
    
    if (plugin.pluginId !== 'fullReplacement' || !plugin.fullReplacementParam) {
      return callback(null, context);
    }

    const { targetId, sourceType } = plugin.fullReplacementParam;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for fullReplacement', {
        targetId,
        pluginId: plugin.id,
      });
      return callback(null, context);
    }

    let content = '';
    
    // Get all messages except the last one which is the user message
    const messagesCopy = cloneDeep(messages);
    messagesCopy.pop(); // Last message is the user message
    const history = messagesCopy; // Remaining messages are history

    switch (sourceType) {
      case 'historyOfSession':
        if (history.length > 0) {
          // Insert history messages as Prompt children (full Prompt type)
          found.prompt.children = [];
          history.forEach((message, idx: number) => {
            // Use the role type from Prompt
            type PromptRole = NonNullable<IPrompt['role']>;
            let role: PromptRole =
              message.role === 'agent' ? 'assistant'
              : message.role === 'user' ? 'user'
              : 'assistant';
            delete found.prompt.text;
            found.prompt.children!.push({
              id: `history-${idx}`,
              caption: `History message ${idx + 1}`,
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
        logger.warn(`Unknown sourceType: ${sourceType}`);
        return callback(null, context);
    }

    logger.debug('Full replacement completed in prompt phase', {
      targetId,
      sourceType,
    });

    callback(null, context);
  });

  // Handle response phase for llmResponse source type
  hooks.postProcess.tapAsync('fullReplacementPlugin', async (context, callback) => {
    const responseContext = context as ResponseHookContext;
    const { plugin, llmResponse, responses } = responseContext;
    
    if (plugin.pluginId !== 'fullReplacement' || !plugin.fullReplacementParam) {
      return callback(null, context);
    }

    const { targetId, sourceType } = plugin.fullReplacementParam;
    
    // Only handle llmResponse in response phase
    if (sourceType !== 'llmResponse') {
      return callback(null, context);
    }

    // Early return if no responses
    if (!responses || responses.length === 0) {
      logger.debug('Skipping full replacement - no responses', {
        pluginId: plugin.id,
      });
      return callback(null, context);
    }

    // Find the target response by ID
    const found = responses.find((r: AgentResponse) => r.id === targetId);

    if (!found) {
      logger.warn('Full replacement target not found in responses', {
        targetId,
        pluginId: plugin.id,
      });
      return callback(null, context);
    }

    // Replace target content with LLM response
    logger.debug('Replacing target with LLM response', {
      targetId,
      responseLength: llmResponse.length,
      pluginId: plugin.id,
    });

    found.text = llmResponse;

    logger.debug('Full replacement completed in response phase', {
      targetId,
      sourceType,
    });

    callback(null, context);
  });
};

/**
 * Dynamic position plugin
 * Inserts content at a specific position relative to a target element
 */
export const dynamicPositionPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('dynamicPositionPlugin', async (context, callback) => {
    const { plugin, prompts } = context;
    
    if (plugin.pluginId !== 'dynamicPosition' || !plugin.dynamicPositionParam || !plugin.content) {
      return callback(null, context);
    }

    const { targetId, position } = plugin.dynamicPositionParam;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for dynamicPosition', {
        targetId,
        pluginId: plugin.id,
      });
      return callback(null, context);
    }

    // Create new prompt part
    const newPart: IPrompt = {
      id: `dynamic-${plugin.id}-${Date.now()}`,
      caption: plugin.caption || 'Dynamic Content',
      text: plugin.content,
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
        logger.warn(`Unknown position: ${position}`);
        return callback(null, context);
    }

    logger.debug('Dynamic position insertion completed', {
      targetId,
      position,
      contentLength: plugin.content.length,
    });

    callback(null, context);
  });
};

/**
 * Retrieval Augmented Generation plugin
 * Retrieves content from wiki or other sources
 */
export const retrievalAugmentedGenerationPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('retrievalAugmentedGenerationPlugin', async (context, callback) => {
    const { plugin, prompts } = context;
    
    if (plugin.pluginId !== 'retrievalAugmentedGeneration' || !plugin.retrievalAugmentedGenerationParam) {
      return callback(null, context);
    }

    const parameter = plugin.retrievalAugmentedGenerationParam;
    const { targetId, position, sourceType, wikiParam } = parameter;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for retrievalAugmentedGeneration', {
        targetId,
        pluginId: plugin.id,
      });
      return callback(null, context);
    }

    try {
      let content = '';
      
      if (sourceType === 'wiki' && wikiParam) {
        // TODO: Implement actual wiki retrieval
        // For now, create a placeholder that could be replaced with actual wiki content
        content = `Wiki content from ${wikiParam.workspaceName} with filter: ${wikiParam.filter}
        
This is where the actual wiki content would be retrieved and injected.
The content would be fetched using the wiki workspace service and filtered according to the provided filter criteria.`;

        logger.debug('RAG plugin - wiki content placeholder created', {
          workspaceName: wikiParam.workspaceName,
          filter: wikiParam.filter,
          pluginId: plugin.id,
        });
      }

      const newPart: IPrompt = {
        id: `rag-${plugin.id}-${Date.now()}`,
        caption: plugin.caption || 'RAG Content',
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
        case 'relative':
          if (!found.prompt.children) {
            found.prompt.children = [];
          }
          found.prompt.children.push(newPart);
          break;
        case 'absolute':
          // For absolute positioning, we'd need additional parameters
          found.parent.splice(found.index + 1, 0, newPart);
          break;
        default:
          logger.warn(`Unknown position: ${position}`);
          return callback(null, context);
      }

      logger.debug('RAG plugin completed', {
        targetId,
        position,
        sourceType,
        contentLength: content.length,
      });

      callback(null, context);
    } catch (error) {
      logger.error('RAG plugin error', error);
      callback(error instanceof Error ? error : new Error(String(error)), context);
    }
  });
};

/**
 * Model Context Protocol plugin
 * Integrates with external MCP servers
 */
export const modelContextProtocolPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('modelContextProtocolPlugin', async (context, callback) => {
    const { plugin, prompts } = context;
    
    if (plugin.pluginId !== 'modelContextProtocol' || !plugin.modelContextProtocolParam) {
      return callback(null, context);
    }

    const parameter = plugin.modelContextProtocolParam;
    const { targetId, position, id, timeoutSecond = 10, timeoutMessage = 'MCP server call timed out' } = parameter;
    const found = findPromptById(prompts, targetId);

    if (!found) {
      logger.warn('Target prompt not found for modelContextProtocol', {
        targetId,
        pluginId: plugin.id,
      });
      return callback(null, context);
    }

    try {
      // TODO: Implement actual MCP server call with timeout
      // For now, create a placeholder that indicates MCP integration
      let content = `MCP Server Call: ${id}
Timeout: ${timeoutSecond} seconds
Timeout Message: ${timeoutMessage}

This is where the actual Model Context Protocol server would be called.
The MCP server would provide additional context or capabilities to the AI model.`;

      // Simulate timeout handling in future implementation
      logger.debug('MCP plugin - simulating server call', {
        mcpId: id,
        timeout: timeoutSecond,
        pluginId: plugin.id,
      });

      const newPart: IPrompt = {
        id: `mcp-${plugin.id}-${Date.now()}`,
        caption: plugin.caption || 'MCP Content',
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
          logger.warn(`Unknown position: ${position}`);
          return callback(null, context);
      }

      logger.debug('MCP plugin completed', {
        targetId,
        position,
        mcpId: id,
      });

      callback(null, context);
    } catch (error) {
      logger.error('MCP plugin error', error);
      callback(error instanceof Error ? error : new Error(String(error)), context);
    }
  });
};
