/**
 * DesktopAgentInstanceClient — wraps window.service.agentInstance IPC
 * to implement the headless AgentInstanceClient interface.
 */

import type { AgentInstanceClient, AgentRuntimeView } from 'memeloop';

/**
 * Desktop implementation of AgentInstanceClient.
 * Delegates to the Electron IPC bridge.
 */
export const createDesktopAgentInstanceClient = (): AgentInstanceClient => ({
  createAgent: async (agentDefinitionId, options) => {
    const agent = await window.service.agentInstance.createAgent(agentDefinitionId, options);
    return { id: agent.id };
  },

  fetchAgent: async (agentId) => {
    const agent = await window.service.agentInstance.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return {
      id: agent.id,
      name: agent.name ?? '',
      agentDefId: agent.agentDefId ?? '',
      status: {
        state: (agent.status?.state ?? 'idle') as AgentRuntimeView['status']['state'],
        progress: agent.status?.progress,
      },
      aiApiConfig: agent.aiApiConfig,
    };
  },

  updateAgent: async (agentId, data) => {
    const updated = await window.service.agentInstance.updateAgent(agentId, data);
    return {
      id: updated.id,
      name: updated.name ?? '',
      agentDefId: updated.agentDefId ?? '',
      status: {
        state: (updated.status?.state ?? 'idle') as AgentRuntimeView['status']['state'],
        progress: updated.status?.progress,
      },
      aiApiConfig: updated.aiApiConfig,
    };
  },

  cancelAgent: async (agentId) => {
    await window.service.agentInstance.cancelAgent(agentId);
  },

  deleteAgent: async (agentId) => {
    await window.service.agentInstance.deleteAgent(agentId);
  },

  subscribeToUpdates: (agentId, listener) => {
    const subscription = window.observables.agentInstance.subscribeToAgentUpdates(agentId)
      .subscribe((update) => {
        if (update) {
          listener({
            status: {
              state: (update as { status?: { state?: string } }).status?.state as AgentRuntimeView['status']['state'] ?? 'idle',
              progress: (update as { status?: { progress?: string } }).status?.progress,
            },
          });
        }
      });
    return () => subscription.unsubscribe();
  },

  getAgentFrameworkId: async (agentId) => {
    const agent = await window.service.agentInstance.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return agent.agentDefId ?? '';
  },

  getFrameworkConfigSchema: async (frameworkId) => {
    return window.service.agentInstance.getFrameworkConfigSchema(frameworkId);
  },
});
