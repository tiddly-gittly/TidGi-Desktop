/**
 * Model Context Protocol handler
 *
 * Integrates with external model context protocol servers
 */
import { logger } from '@services/libs/log';
import { findPromptById, PromptConcatContext } from '../../promptConcat';
import { IPrompt, PromptDynamicModification } from '../../promptConcatSchema';
import { shouldTrigger } from '../shared/utilities';

/**
 * Handler for dynamicModificationType: "modelContextProtocol"
 * Integrates with external model context protocol servers
 */
export async function modelContextProtocolHandler(prompts: IPrompt[], modification: PromptDynamicModification, context: PromptConcatContext): Promise<IPrompt[]> {
  if (!modification.modelContextProtocolParam) {
    logger.debug('Missing modelContextProtocolParam', {
      modificationType: 'modelContextProtocol',
      modificationId: modification.id,
    });
    return prompts;
  }

  const parameter = modification.modelContextProtocolParam;
  const { targetId, position, id, timeoutSecond = 10, timeoutMessage = 'MCP server call timed out' } = parameter;
  const target = findPromptById(prompts, targetId);

  if (!target) {
    logger.warn('Target prompt not found for modelContextProtocol', {
      targetId,
      modificationId: modification.id,
    });
    return prompts;
  }

  // Skip if trigger conditions not met
  if (!(await shouldTrigger(parameter.trigger, target.prompt.text, context))) {
    logger.debug('MCP trigger conditions not met, skipping', {
      modificationId: modification.id,
      mcpId: id,
    });
    return prompts;
  }

  logger.debug('Calling MCP server', {
    mcpId: id,
    timeout: timeoutSecond,
  });

  // Call MCP server with timeout
  callMCPServerWithTimeout(id, context, timeoutSecond, timeoutMessage)
    .then(result => {
      if (!result) return;

      // Create new prompt part
      const newPart: IPrompt = {
        id: `mcp-${Date.now()}`,
        caption: 'MCP Tool Response',
        text: result,
        source: context.sourcePaths?.get(modification.id),
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
      logger.error('Error calling MCP server', {
        error: error instanceof Error ? error.message : String(error),
        mcpId: id,
      });
    });

  return prompts;
}

/**
 * Calls an MCP server with a timeout
 */
async function callMCPServerWithTimeout(
  mcpId: string,
  context: PromptConcatContext,
  timeoutSeconds: number,
  timeoutMessage: string,
): Promise<string> {
  try {
    // Create a promise that rejects after the timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutSeconds * 1000);
    });

    // Create the MCP server call promise
    const callPromise = callMCPServer(mcpId, context);

    // Race the two promises
    return await Promise.race([callPromise, timeoutPromise]);
  } catch (error) {
    logger.error('MCP server call failed or timed out', {
      error: error instanceof Error ? error.message : String(error),
      mcpId,
    });
    return timeoutMessage;
  }
}

/**
 * Calls an MCP server using the MCP service
 * This is a placeholder implementation
 */
async function callMCPServer(mcpId: string, _context: PromptConcatContext): Promise<string> {
  try {
    // In a real implementation, you would get the MCP service from the container
    // const mcpService = container.get<IMCPService>(serviceIdentifier.MCPService);
    // return await mcpService.callMCPServer(mcpId, context);

    // For now, we'll return a placeholder
    logger.debug('Calling MCP server (placeholder)', {
      mcpId,
    });

    // Simulate MCP server response based on the mcpId
    if (mcpId === '@amap/amap-maps-mcp-server') {
      return `
<tool name="amap_maps">
  <description>AMap mapping and navigation tool for searching locations, planning routes, and checking traffic conditions.</description>
  <parameters>
    <parameter name="query" type="string" required="true">
      Search keyword, e.g., "Beijing Sanlitun"
    </parameter>
    <parameter name="type" type="string" required="false" default="location">
      Search type: location, route, traffic, or poi (point of interest)
    </parameter>
  </parameters>
</tool>
      `;
    }

    return `Tool definition from MCP server "${mcpId}"`;
  } catch (error) {
    logger.error('Error calling MCP server', {
      error: error instanceof Error ? error.message : String(error),
      mcpId,
    });
    throw error;
  }
}
