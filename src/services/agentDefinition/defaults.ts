/**
 * Default agent definition helpers.
 */
import { getBuiltinAgentDefinitions } from 'memeloop';

/** ID of the built-in agent definition to use as the default when creating a new agent. */
export function getDefaultAgentDefinitionId(): string {
  const builtinAgents = getBuiltinAgentDefinitions() as unknown as Array<{ id: string }>;
  return builtinAgents[0]?.id ?? 'memeloop:general-assistant';
}
