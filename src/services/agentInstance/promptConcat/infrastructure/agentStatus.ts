/**
 * Agent Status Infrastructure
 *
 * Handles agent status updates and persistence.
 * This is core infrastructure, not a user-configurable plugin.
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IAgentInstanceService } from '../../interface';
import type { AgentStatusContext, PromptConcatHooks } from '../../tools/types';

/**
 * Register agent status handlers to hooks
 */
export function registerAgentStatus(hooks: PromptConcatHooks): void {
  // Handle agent status persistence
  hooks.agentStatusChanged.tapAsync('agentStatus', async (context: AgentStatusContext, callback) => {
    try {
      const { agentFrameworkContext, status } = context;

      // Get the agent instance service to update status
      const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

      // Update agent status in database
      await agentInstanceService.updateAgent(agentFrameworkContext.agent.id, {
        status,
      });

      // Update the agent object for immediate use
      agentFrameworkContext.agent.status = status;

      logger.debug('Agent status updated in database', {
        agentId: agentFrameworkContext.agent.id,
        state: status.state,
      });

      callback();
    } catch (error) {
      logger.error('Agent status error in agentStatusChanged', {
        error,
        agentId: context.agentFrameworkContext.agent.id,
        status: context.status,
      });
      callback();
    }
  });
}
