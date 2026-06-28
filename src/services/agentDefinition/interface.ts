/**
 * AgentDefinition service IPC contract.
 * memeloop core manages the model, Desktop provides the storage layer.
 */
import { AgentChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { AgentDefinition, TiddlerFieldsForAgent } from 'memeloop';

export interface AgentTemplateTiddlerSource {
  tiddler: unknown;
  workspaceName: string;
}

export type AgentTemplateSource = () => Promise<AgentTemplateTiddlerSource[]>;

export interface IAgentDefinitionService {
  initialize(): Promise<void>;
  configureTemplateSource(source: AgentTemplateSource): void;
  createAgentDef(agent: AgentDefinition): Promise<AgentDefinition>;
  updateAgentDef(agent: Partial<AgentDefinition> & { id: string }): Promise<AgentDefinition>;
  getAgentDefs(): Promise<AgentDefinition[]>;
  getAgentDef(id?: string): Promise<AgentDefinition | undefined>;
  getAgentTemplates(): Promise<AgentDefinition[]>;
  deleteAgentDef(id: string): Promise<void>;
}

export type { TiddlerFieldsForAgent };

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
