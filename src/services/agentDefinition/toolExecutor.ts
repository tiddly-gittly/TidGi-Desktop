import { globalToolRegistry } from '@services/agentInstance/buildInAgentTools';
import { logger } from '@services/libs/log';
import { matchToolCalling } from './responsePatternUtility';

/**
 * Execute a tool with given parameters
 * @param toolId Tool ID to execute
 * @param parameters Parameters to pass to the tool
 * @param context Optional context for tool execution
 * @returns Tool execution result
 */
export async function executeTool(
  toolId: string, 
  parameters: Record<string, unknown>, 
  context?: { workspaceId?: string; metadata?: Record<string, unknown> }
): Promise<{ success: boolean; data?: string; error?: string; metadata?: Record<string, unknown> }> {
  try {
    // Get the tool from the registry
    const tool = globalToolRegistry.getTool(toolId);
    
    if (!tool) {
      logger.warn('Tool not found in registry', { toolId });
      return {
        success: false,
        error: `Tool ${toolId} not found`,
      };
    }
    
    // Execute the tool
    const toolResult = await tool.execute(parameters, {
      workspaceId: context?.workspaceId || 'unknown',
      metadata: context?.metadata || {},
    });
    
    if (toolResult.success) {
      logger.info('Successfully executed tool', {
        toolId,
        hasData: !!toolResult.data,
      });
      
      return {
        success: true,
        data: toolResult.data as string,
        metadata: toolResult.metadata,
      };
    } else {
      logger.warn('Tool execution failed', {
        toolId,
        error: toolResult.error,
      });
      
      return {
        success: false,
        error: toolResult.error,
      };
    }
  } catch (error) {
    logger.error('Error executing tool', {
      error: error instanceof Error ? error.message : String(error),
      toolId,
      parameters,
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Match tool calling patterns in AI response text and execute the tool if found
 * @param responseText AI response text to analyze
 * @param context Optional context for tool execution
 * @returns Tool execution result or undefined if no tool call found
 */
export async function matchAndExecuteTool(
  responseText: string, 
  context?: { workspaceId?: string; metadata?: Record<string, unknown> }
): Promise<{ success: boolean; data?: string; error?: string; metadata?: Record<string, unknown> } | undefined> {
  try {
    // Check if this message contains a tool call
    const toolMatch = matchToolCalling(responseText);
    
    if (toolMatch.found && toolMatch.toolId && toolMatch.parameters) {
      logger.debug('Found tool call in text', {
        toolId: toolMatch.toolId,
        parameters: toolMatch.parameters,
      });
      
      // Execute the tool
      const toolResult = await executeTool(
        toolMatch.toolId,
        toolMatch.parameters,
        context
      );
      
      return toolResult;
    } else {
      logger.debug('No tool call found in text');
      return undefined;
    }
  } catch (error) {
    logger.error('Error in matchAndExecuteTool', {
      error: error instanceof Error ? error.message : String(error),
      responseText: responseText.substring(0, 100) + '...', // Log first 100 chars only
    });
    return undefined;
  }
}
