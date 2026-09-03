import type { AgentDefinition, AgentFrameworkConfig } from 'memeloop';
import { mergeAgentToolsIntoFrameworkConfig } from 'memeloop/tools';

/** Materialize host tool declarations in the editable prompt configuration. */
export function createEditableAgentFrameworkConfig(definition: AgentDefinition): AgentFrameworkConfig {
  return mergeAgentToolsIntoFrameworkConfig(definition.agentFrameworkConfig, definition.agentTools);
}
