import { AgentChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { AiAPIConfig } from '../agentInstance/promptConcat/promptConcatSchema';

/**
 * Agent tool configuration
 */
export interface AgentToolConfig {
  /** Tool ID to reference the tool */
  toolId: string;
  /** Whether this tool is enabled for this agent */
  enabled?: boolean;
  /** Custom parameters for this tool instance */
  parameters?: Record<string, unknown>;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Tool calling match result
 */
export interface ToolCallingMatch {
  /** Whether a tool call was found in the text */
  found: boolean;
  /** Tool ID to call */
  toolId?: string;
  /** Parameters to pass to the tool */
  parameters?: Record<string, unknown>;
  /** Original text that matched the pattern */
  originalText?: string;
}

/**
 * Agent definition, including basic information and processing logic
 */
export interface AgentDefinition {
  /** Unique identifier for the agent */
  id: string;
  /** Agent name */
  name?: string;
  /** Agent description */
  description?: string;
  /** Agent icon or avatar URL */
  avatarUrl?: string;
  /** Agent framework function's id, we will find function by this id */
  agentFrameworkID?: string;
  /** Agent framework's config, specific to the framework. This is required to ensure agent has valid configuration. */
  agentFrameworkConfig: Record<string, unknown>;
  /**
   * Overwrite the default AI configuration for this agent.
   * Priority is higher than the global default agent config.
   */
  aiApiConfig?: Partial<AiAPIConfig>;
  /**
   * Tools available to this agent
   */
  agentTools?: AgentToolConfig[];
}

/**
 * Agent service to manage agent definitions
 */
export interface IAgentDefinitionService {
  /**
   * Initialize the service on application startup.
   */
  initialize(): Promise<void>;
  /**
   * Create a new agent definition and persist it to the database.
   * Generates a new id when `agent.id` is not provided.
   * @param agent Agent definition to create
   * @returns The created AgentDefinition (including generated id)
   */
  createAgentDef(agent: AgentDefinition): Promise<AgentDefinition>;
  /**
   * Update an existing agent definition. Only the provided fields will be updated.
   * @param agent Partial agent definition containing the required `id` field
   * @returns The updated AgentDefinition
   */
  updateAgentDef(agent: Partial<AgentDefinition> & { id: string }): Promise<AgentDefinition>;
  /**
   * Get all available agent definitions.
   * This returns simplified definitions (without handler instances). No server-side
   * search is performed; clients should apply any filtering required.
   */
  getAgentDefs(): Promise<AgentDefinition[]>;
  /**
   * Get a specific agent definition by id. When `id` is omitted, returns the default
   * agent definition (currently the first agent in the repository as a temporary solution).
   * @param id Optional agent id
   */
  getAgentDef(id?: string): Promise<AgentDefinition | undefined>;
  /**
   * Get all available agent templates from built-in defaults and active main workspaces.
   * This returns fully populated templates suitable for creating new agents. No server-side
   * search filtering is performed; clients should filter templates as needed.
   */
  getAgentTemplates(): Promise<AgentDefinition[]>;
  /**
   * Delete an agent definition
   * @param id Agent definition ID
   */
  deleteAgentDef(id: string): Promise<void>;
}

export const AgentDefinitionServiceIPCDescriptor = {
  channel: AgentChannel.definition,
  properties: {
    createAgentDef: ProxyPropertyType.Function,
    updateAgentDef: ProxyPropertyType.Function,
    getAgentDefs: ProxyPropertyType.Function,
    getAgentDef: ProxyPropertyType.Function,
    getAgentTemplates: ProxyPropertyType.Function,
    deleteAgentDef: ProxyPropertyType.Function,
  },
};
