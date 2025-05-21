/**
 * Shared utilities for prompt and response handlers
 */
import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { Message } from 'ai';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import { PromptPart } from './types';

/**
 * Trigger configuration interface defining possible trigger conditions
 */
interface TriggerConfig {
  search?: string;
  randomChance?: number;
  filter?: string;
  model?: {
    preset?: string;
    system?: string;
    user?: string;
  };
}

/**
 * Determines if the modification should be triggered based on trigger conditions
 * Can evaluate against user message and/or LLM response text
 *
 * @param trigger Trigger configuration from schema
 * @param targetText Optional target text to check (for response triggers)
 * @param context Handler context with history and agent info
 * @returns Whether trigger conditions are met
 */
export async function shouldTrigger(
  trigger: TriggerConfig | undefined,
  targetText?: string,
  context?: PromptConcatContext,
): Promise<boolean> {
  if (!trigger) return true; // No trigger conditions means always trigger
  if (!context) return false;

  const [userMessage] = context.messages;

  // Check search keywords in both user message and target text
  if (trigger.search) {
    const searchTerms = trigger.search.split(',');

    // Check in user message if available
    if (userMessage.content) {
      const messageMatches = searchTerms.some((term: string) => userMessage.content.toLowerCase().includes(term.trim().toLowerCase()));
      if (messageMatches) return true;
    }

    // Check in target text if available (for response triggers)
    if (targetText) {
      const textMatches = searchTerms.some((term: string) => targetText.toLowerCase().includes(term.trim().toLowerCase()));
      if (textMatches) return true;
    }
  }

  // Check random chance
  if (typeof trigger.randomChance === 'number') {
    if (Math.random() < trigger.randomChance) return true;
  }

  // Check filter (simplified implementation)
  if (trigger.filter) {
    if (userMessage.content && userMessage.content.includes(trigger.filter)) return true;
    if (targetText && targetText.includes(trigger.filter)) return true;
  }

  // Model-based trigger requires a separate LLM call
  if (trigger.model) {
    try {
      const result = await evaluateModelTrigger(
        trigger.model,
        targetText || userMessage.content || '',
        context,
      );
      return result;
    } catch (error) {
      logger.error('Error in model-based trigger evaluation', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return false;
}

/**
 * Evaluates trigger conditions using a model
 * Uses a lightweight model to determine if the content meets trigger criteria
 *
 * @param modelConfig Model trigger configuration
 * @param content Content to evaluate
 * @param context Handler context
 * @returns Whether the model determined the trigger should activate
 */
async function evaluateModelTrigger(
  modelConfig: TriggerConfig['model'],
  content: string,
  _context: PromptConcatContext,
): Promise<boolean> {
  if (!content || !modelConfig) return false;

  try {
    // Create a simple prompt that evaluates whether the trigger applies
    const systemPrompt = modelConfig.system ||
      '你是一个用于评估触发条件的助手。请判断所提供的内容是否满足触发条件，回答"是"或"否"。';

    let userPrompt = modelConfig.user || '请分析以下内容，并判断是否需要采取进一步行动：\n\n<<input>>';
    userPrompt = userPrompt.replace(/<<input>>/g, content);

    // Get the external API service
    const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);

    // Create a minimal config for the model call
    const triggerModelConfig = {
      api: {
        provider: 'openai',
        model: modelConfig.preset || 'gpt-3.5-turbo',
      },
      modelParameters: {
        temperature: 0.1,
        maxTokens: 10,
        systemPrompt: systemPrompt,
      },
    };

    // Create messages for the model
    const messages: Array<Omit<Message, 'id'>> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    logger.debug('Evaluating model trigger', {
      contentLength: content.length,
      model: triggerModelConfig.api.model,
    });

    // Call the model with a short timeout
    let response = '';
    for await (const result of externalAPIService.generateFromAI(messages, triggerModelConfig)) {
      if (result.status === 'done' && result.content) {
        response = result.content;
        break;
      }
    }

    // Check if response indicates a trigger
    const positiveResponses = ['是', '需要', '满足', 'yes', 'true', '应该', '同意'];
    const shouldTrigger = positiveResponses.some((term: string) => response.toLowerCase().includes(term.toLowerCase()));

    logger.debug('Model trigger evaluation result', {
      response: response.substring(0, 50),
      shouldTrigger,
    });

    return shouldTrigger;
  } catch (error) {
    logger.error('Model trigger evaluation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Inserts content at the specified position relative to target
 */
export function insertContent(target: ReturnType<typeof findPromptById>, newPart: PromptPart, position: string): void {
  if (!target) return;

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
}

/**
 * Parses a regex string into a RegExp object
 * Handles common regex format with pattern and flags
 *
 * @param regexString String representation of regex with pattern and flags
 * @returns RegExp object or null if invalid
 */
export function parseRegexString(regexString: string): RegExp | null {
  try {
    // Expected format: "/pattern/flags"
    const match = regexString.match(/^\/(.*?)\/([gimsuyd]*)$/);

    if (!match) {
      return null;
    }

    const [, pattern, flags] = match;
    return new RegExp(pattern, flags);
  } catch (error) {
    logger.error('Failed to parse regex string', {
      regexString,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Loads content from URI (file, http, etc)
 * This is a placeholder implementation
 */
export async function loadContentFromUri(uri: string): Promise<string> {
  try {
    logger.debug('Loading content from URI (placeholder)', { uri });

    // In a real implementation, you would use the appropriate service based on the URI
    if (uri.startsWith('tidgi://wiki/')) {
      // Wiki content
      const path = uri.replace('tidgi://wiki/', '');
      return `Content from wiki file: ${path}`;
    } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
      // HTTP content
      return `Content from URL: ${uri}`;
    } else if (uri.startsWith('file://')) {
      // File content
      const path = uri.replace('file://', '');
      return `Content from file: ${path}`;
    }

    return `Content loaded from "${uri}"`;
  } catch (error) {
    logger.error('Error loading content from URI', {
      error: error instanceof Error ? error.message : String(error),
      uri,
    });
    return '';
  }
}
