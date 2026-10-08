import { mergeDesktopAgentToolsIntoFrameworkConfig } from '@services/agentDefinition/frameworkConfig';
import type { AgentDefinition, AgentFrameworkConfig } from 'memeloop';

/** Materialize host tool declarations in the editable prompt configuration. */
export function createEditableAgentFrameworkConfig(definition: AgentDefinition): AgentFrameworkConfig {
  return mergeDesktopAgentToolsIntoFrameworkConfig(definition.agentFrameworkConfig, definition.agentTools);
}
