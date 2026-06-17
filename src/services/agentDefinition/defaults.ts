/**
 * Default agent definition helpers.
 */
import { getBuiltinLoopProfiles } from 'memeloop';

/** ID of the built-in agent definition to use as the default when creating a new agent. */
export function getDefaultAgentDefinitionId(): string {
  const builtinProfiles = getBuiltinLoopProfiles();
  return builtinProfiles[0]?.id ?? 'memeloop:general-assistant';
}
