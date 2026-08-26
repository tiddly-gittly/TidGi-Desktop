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
    options?.signal?.throwIfAborted();
    const agent = await window.service.agentInstance.createAgent(agentDefinitionId, { preview: options?.preview });
    options?.signal?.throwIfAborted();
    return { id: agent.id };
  },

  fetchAgent: async (agentId, options) => {
    options?.signal?.throwIfAborted();
    const agent = await window.service.agentInstance.getAgentMetadata(agentId);
    options?.signal?.throwIfAborted();
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return {
      id: agent.id,
      name: agent.name ?? '',
      agentDefId: agent.agentDefId ?? '',
      status: {
        state: (agent.status?.state ?? 'idle') as AgentRuntimeView['status']['state'],
        progress: agent.status?.progress,
      },
      modelConfig: agent.modelConfig,
    };
  },

  updateAgent: async (agentId, data, options) => {
    options?.signal?.throwIfAborted();
    const updated = await window.service.agentInstance.updateAgent(agentId, data);
    options?.signal?.throwIfAborted();
    return {
      id: updated.id,
      name: updated.name ?? '',
      agentDefId: updated.agentDefId ?? '',
      status: {
        state: (updated.status?.state ?? 'idle') as AgentRuntimeView['status']['state'],
        progress: updated.status?.progress,
      },
      modelConfig: updated.modelConfig,
    };
  },

  cancelAgent: async (agentId, options) => {
    options?.signal?.throwIfAborted();
    await window.service.agentInstance.cancelAgent(agentId);
    options?.signal?.throwIfAborted();
  },

  deleteAgent: async (agentId, options) => {
    options?.signal?.throwIfAborted();
    await window.service.agentInstance.deleteAgent(agentId);
    options?.signal?.throwIfAborted();
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
    return () => {
      subscription.unsubscribe();
    };
  },

  getAgentFrameworkId: async (agentId, options) => {
    options?.signal?.throwIfAborted();
    const agent = await window.service.agentInstance.getAgentMetadata(agentId);
    options?.signal?.throwIfAborted();
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return agent.agentDefId ?? '';
  },

  getFrameworkConfigSchema: async (frameworkId, options) => {
    options?.signal?.throwIfAborted();
    const schema = await window.service.agentInstance.getFrameworkConfigSchema(frameworkId);
    options?.signal?.throwIfAborted();
    return schema;
  },
});
