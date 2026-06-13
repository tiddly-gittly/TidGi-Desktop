import { AgentChannel } from '@/constants/channels';
import type { AiAPIConfig } from '@services/agentInstance/schema';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { getBuiltinAgentDefinitions } from 'memeloop';

/** ID of the built-in agent definition to use as the default when creating a new agent. */
export function getDefaultAgentDefinitionId(): string {
  const builtinAgents = getBuiltinAgentDefinitions() as unknown as Array<{ id: string }>;
  return builtinAgents[0]?.id ?? 'memeloop:general-assistant';
}

/** Flat ToolCallingMatch used by Desktop tool files (non-discriminated union). */
export interface ToolCallingMatch {
  found: boolean;
  toolId?: string;
  parameters?: Record<string, unknown>;
  originalText?: string;
}

export interface AgentToolConfig {
  toolId: string;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
  tags?: string[];
}

export interface AgentHeartbeatConfig {
  enabled: boolean;
  intervalSeconds: number;
  message: string;
  activeHoursStart?: string;
  activeHoursEnd?: string;
}

export interface AgentDefinition {
  id: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  agentFrameworkID?: string;
  agentFrameworkConfig: Record<string, unknown>;
  aiApiConfig?: Partial<AiAPIConfig>;
  agentTools?: AgentToolConfig[];
  heartbeat?: AgentHeartbeatConfig;
}

export interface IAgentDefinitionService {
  initialize(): Promise<void>;
  createAgentDef(agent: AgentDefinition): Promise<AgentDefinition>;
  updateAgentDef(agent: Partial<AgentDefinition> & { id: string }): Promise<AgentDefinition>;
  getAgentDefs(): Promise<AgentDefinition[]>;
  getAgentDef(id?: string): Promise<AgentDefinition | undefined>;
  getAgentTemplates(): Promise<AgentDefinition[]>;
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
