/**
 * AgentDefinition service IPC contract.
 * memeloop core manages the model, Desktop provides the storage layer.
 */
import { AgentChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { AgentDefinition, AgentLoopScriptPolicy, TiddlerFieldsForAgent } from 'memeloop';

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
  saveAgentLoopScript(input: { id: string; loopId: string; source: string; metadata?: Record<string, unknown> }): Promise<AgentDefinition>;
  getLoopScriptPolicy(): AgentLoopScriptPolicy;
  getAgentDefs(): Promise<AgentDefinition[]>;
  getAgentDef(id?: string): Promise<AgentDefinition | undefined>;
  getAgentTemplates(): Promise<AgentDefinition[]>;
  deleteAgentDef(id: string): Promise<void>;
}

export type { AgentDefinition, TiddlerFieldsForAgent };

export const AgentDefinitionServiceIPCDescriptor = {
  channel: AgentChannel.definition,
  properties: {
    createAgentDef: ProxyPropertyType.Function,
    updateAgentDef: ProxyPropertyType.Function,
    saveAgentLoopScript: ProxyPropertyType.Function,
    getAgentDefs: ProxyPropertyType.Function,
    getAgentDef: ProxyPropertyType.Function,
    getAgentTemplates: ProxyPropertyType.Function,
    deleteAgentDef: ProxyPropertyType.Function,
  },
};
