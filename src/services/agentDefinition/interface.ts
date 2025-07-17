import { AgentChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { AiAPIConfig } from '../agentInstance/promptConcat/promptConcatSchema';
import type { OptimizedToolSchema } from './llmToolSchemaOptimizer';

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
  name: string;
  /** Agent description */
  description?: string;
  /** Agent icon or avatar URL */
  avatarUrl?: string;
  /** Agent handler function's id, we will find function by this id */
  handlerID?: string;
  /** Agent handler's config, specific to the handler. */
  handlerConfig?: Record<string, unknown>;
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
   * Create a new agent
   * @param agent Agent definition
   */
  createAgentDef(agent: AgentDefinition): Promise<AgentDefinition>;
  /**
   * Update an existing agent
   * @param agent Partial agent definition with id required
   */
  updateAgentDef(agent: Partial<AgentDefinition> & { id: string }): Promise<AgentDefinition>;
  /**
   * Get all available agents (simplified, without handler)
   */
  getAgentDefs(options?: { searchName?: string }): Promise<AgentDefinition[]>;
  /**
   * Get a specific agent. No id means get default agent that config in the preference.
   * @param id Agent ID
   */
  getAgentDef(id?: string): Promise<AgentDefinition | undefined>;
  /**
   * Delete an agent definition
   * @param id Agent definition ID
   */
  deleteAgentDef(id: string): Promise<void>;
  /**
   * Register tools for an agent
   * @param agentId Agent ID
   * @param tools Tool configurations
   */
  registerAgentTools(agentId: string, tools: AgentToolConfig[]): Promise<void>;
  /**
   * Get tools for an agent
   * @param agentId Agent ID
   */
  getAgentTools(agentId: string): Promise<AgentToolConfig[]>;
  /**
   * Get all available tools that can be registered
   */
  getAvailableTools(): Promise<Array<{ id: string; name: string; description: string; schema: OptimizedToolSchema }>>;
}

export const AgentDefinitionServiceIPCDescriptor = {
  channel: AgentChannel.definition,
  properties: {
    createAgentDef: ProxyPropertyType.Function,
    updateAgentDef: ProxyPropertyType.Function,
    getAgentDefs: ProxyPropertyType.Function,
    getAgentDef: ProxyPropertyType.Function,
    deleteAgentDef: ProxyPropertyType.Function,
    registerAgentTools: ProxyPropertyType.Function,
    getAgentTools: ProxyPropertyType.Function,
    getAvailableTools: ProxyPropertyType.Function,
  },
};
