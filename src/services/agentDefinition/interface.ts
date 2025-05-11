import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { AgentChannel } from '@/constants/channels';
import { AiAPIConfig } from '../agentInstance/buildInAgentHandlers/promptConcatUtils/promptConcatSchema';

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
   * @param agent Agent definition
   */
  updateAgentDef(agent: AgentDefinition): Promise<AgentDefinition>;
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
}

export const AgentDefinitionServiceIPCDescriptor = {
  channel: AgentChannel.definition,
  properties: {
    createAgentDef: ProxyPropertyType.Function,
    updateAgentDef: ProxyPropertyType.Function,
    getAgentDefs: ProxyPropertyType.Function,
    getAgentDef: ProxyPropertyType.Function,
    deleteAgentDef: ProxyPropertyType.Function,
  },
};
