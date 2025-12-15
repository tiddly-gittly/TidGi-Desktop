/**
 * Core Infrastructure
 *
 * Core infrastructure components that are always active, not user-configurable.
 * These handle message persistence, streaming updates, agent status, and UI sync.
 */
import type { PromptConcatHooks } from '../../tools/types';
import { registerAgentStatus } from './agentStatus';
import { registerMessagePersistence } from './messagePersistence';
import { registerStreamingResponse } from './streamingResponse';

export { registerAgentStatus } from './agentStatus';
export { registerMessagePersistence } from './messagePersistence';
export { registerStreamingResponse } from './streamingResponse';

/**
 * Register all core infrastructure to hooks.
 * This should be called once when creating hooks for an agent.
 */
export function registerCoreInfrastructure(hooks: PromptConcatHooks): void {
  registerMessagePersistence(hooks);
  registerStreamingResponse(hooks);
  registerAgentStatus(hooks);
}
