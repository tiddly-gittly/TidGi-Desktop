import type { AgentDefinition, AgentFrameworkConfig } from 'memeloop';
import { mergeAgentToolsIntoFrameworkConfig } from 'memeloop/tools';

/** Materialize host tool declarations in the editable prompt configuration. */
export function createEditableAgentFrameworkConfig(definition: AgentDefinition): AgentFrameworkConfig {
  return mergeAgentToolsIntoFrameworkConfig(definition.agentFrameworkConfig, definition.agentTools);
}

/**
 * Once the merged form is edited, it is the complete source of truth. An
 * explicit empty agentTools list prevents the host/bundled fallback from
 * silently re-enabling a tool that the user disabled in the form.
 */
export function applyEditedAgentFrameworkConfig(
  definition: AgentDefinition,
  agentFrameworkConfig: AgentFrameworkConfig,
): AgentDefinition {
  return {
    ...definition,
    agentFrameworkConfig,
    agentTools: [],
  };
}
