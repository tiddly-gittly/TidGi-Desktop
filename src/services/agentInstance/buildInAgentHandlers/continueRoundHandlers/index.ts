import { logger } from '@services/libs/log';
import { AgentPromptDescription } from '../../promptConcat/promptConcatSchema';
import { AgentHandlerContext } from '../type';
import { toolCallingHandler } from './toolCallingHandler';
import { ContinueRoundHandlerConfig, ContinueRoundResult } from './types';

/**
 * Registry for continue round handlers
 */
class ContinueRoundHandlerRegistry {
  private handlers: ContinueRoundHandlerConfig[] = [];

  /**
   * Register a continue round handler
   */
  register(config: ContinueRoundHandlerConfig): void {
    // Remove existing handler with same ID
    this.handlers = this.handlers.filter(h => h.id !== config.id);

    // Add new handler
    this.handlers.push(config);

    // Sort by priority
    this.handlers.sort((a, b) => a.priority - b.priority);

    logger.debug('Continue round handler registered', {
      id: config.id,
      priority: config.priority,
      enabled: config.enabled,
      totalHandlers: this.handlers.length,
    });
  }

  /**
   * Unregister a continue round handler
   */
  unregister(id: string): void {
    const originalLength = this.handlers.length;
    this.handlers = this.handlers.filter(h => h.id !== id);

    if (this.handlers.length < originalLength) {
      logger.debug('Continue round handler unregistered', {
        id,
        remainingHandlers: this.handlers.length,
      });
    }
  }

  /**
   * Process all handlers to determine if conversation should continue
   * Returns the result from the first handler that decides to continue
   */
  async processContinueRound(
    agentConfig: AgentPromptDescription,
    llmResponse: string,
    context: AgentHandlerContext,
  ): Promise<ContinueRoundResult> {
    const enabledHandlers = this.handlers.filter(h => h.enabled);

    logger.debug('Processing continue round handlers', {
      totalHandlers: this.handlers.length,
      enabledHandlers: enabledHandlers.length,
      handlerIds: enabledHandlers.map(h => h.id),
    });

    for (const handlerConfig of enabledHandlers) {
      try {
        logger.debug('Executing continue round handler', {
          id: handlerConfig.id,
          priority: handlerConfig.priority,
        });

        const result = await handlerConfig.handler(agentConfig, llmResponse, context);

        logger.debug('Continue round handler result', {
          id: handlerConfig.id,
          continue: result.continue,
          reason: result.reason,
          hasNewMessage: !!result.newMessage,
        });

        // If this handler decides to continue, return immediately
        if (result.continue) {
          logger.info('Continue round decision made', {
            handlerId: handlerConfig.id,
            reason: result.reason,
          });
          return result;
        }
      } catch (error) {
        logger.error('Error in continue round handler', {
          handlerId: handlerConfig.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next handler on error
      }
    }

    // No handler decided to continue
    logger.debug('No continue round handler decided to continue');
    return {
      continue: false,
      reason: 'No handlers triggered continuation',
    };
  }

  /**
   * Get all registered handlers (for debugging)
   */
  getHandlers(): ContinueRoundHandlerConfig[] {
    return [...this.handlers];
  }
}

// Global registry instance
export const continueRoundHandlerRegistry = new ContinueRoundHandlerRegistry();

/**
 * Convenience function to process continue round logic
 */
export const continueRoundHandler = (
  agentConfig: AgentPromptDescription,
  llmResponse: string,
  context: AgentHandlerContext,
): Promise<ContinueRoundResult> => {
  return continueRoundHandlerRegistry.processContinueRound(agentConfig, llmResponse, context);
};

// Register default handlers
continueRoundHandlerRegistry.register({
  id: 'tool-calling',
  handler: toolCallingHandler,
  priority: 100, // Higher priority for tool calling
  enabled: true,
});
