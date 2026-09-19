/**
 * DesktopAgentDefinitionRepository — wraps window.service.agentDefinition IPC
 * to implement the headless AgentDefinitionRepository interface.
 */

import type { AgentDefinitionRepository } from 'memeloop';

/**
 * Desktop implementation of AgentDefinitionRepository.
 * Delegates to the Electron IPC bridge.
 */
export const createDesktopAgentDefinitionRepository = (): AgentDefinitionRepository => ({
  createAgentDef: async (agent) => {
    return window.service.agentDefinition.createAgentDef(agent);
  },

  updateAgentDef: async (agent) => {
    return window.service.agentDefinition.updateAgentDef(agent);
  },

  getAgentDefs: async () => {
    return window.service.agentDefinition.getAgentDefs();
  },

  getAgentDef: async (id) => {
    return window.service.agentDefinition.getAgentDef(id);
  },

  getAgentTemplates: async () => {
    return window.service.agentDefinition.getAgentTemplates();
  },

  deleteAgentDef: async (id) => {
    return window.service.agentDefinition.deleteAgentDef(id);
  },
});
