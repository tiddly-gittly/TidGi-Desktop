/* eslint-disable unicorn/prevent-abbreviations */
import { AgentDefinition } from '@services/agentDefinition/interface';
import type { AgentInstance, AgentInstanceMessage } from '@services/agentInstance/interface';
import type { StoreApi } from 'zustand';
import type { AgentChatStoreType, AgentWithoutMessages } from '../types';

export const agentActions = (
  set: StoreApi<AgentChatStoreType>['setState'],
  get: StoreApi<AgentChatStoreType>['getState'],
) => ({
  processAgentData: async (
    fullAgent: AgentInstance,
  ): Promise<{
    agent: AgentWithoutMessages;
    agentDef: AgentDefinition | null;
    messages: Map<string, AgentInstanceMessage>;
    orderedMessageIds: string[];
  }> => {
    // 将消息数组转换为以 ID 为 key 的 Map
    const messagesMap = new Map<string, AgentInstanceMessage>();
    // 创建一个有序的消息 ID 数组
    const orderedIds: string[] = [];
    
    // 将代理数据分为不含消息的代理数据和消息 Map
    const { messages = [], ...agentWithoutMessages } = fullAgent;

    // 按修改时间升序排序消息
    const sortedMessages = [...messages].sort((a, b) => {
      const dateA = a.modified ? new Date(a.modified).getTime() : 0;
      const dateB = b.modified ? new Date(b.modified).getTime() : 0;
      return dateA - dateB;
    });

    // 填充消息 Map 和有序 ID 数组
    sortedMessages.forEach(message => {
      messagesMap.set(message.id, message);
      orderedIds.push(message.id);
    });

    // 如果有 agentDefId,加载 agentDef
    let agentDef: AgentDefinition | null = null;
    if (agentWithoutMessages.agentDefId) {
      try {
        const fetchedDef = await window.service.agentDefinition.getAgentDef(agentWithoutMessages.agentDefId);
        agentDef = fetchedDef || null;
      } catch (error) {
        console.error(`Failed to fetch agent definition for ${agentWithoutMessages.agentDefId}:`, error);
      }
    }

    return {
      agent: agentWithoutMessages as AgentWithoutMessages,
      agentDef,
      messages: messagesMap,
      orderedMessageIds: orderedIds,
    };
  },

  setAgent: (agentData: AgentWithoutMessages | null) => {
    set({ agent: agentData });
  },

  loadAgent: async (agentId: string) => {
    if (!agentId) return;

    try {
      set({ loading: true, error: null });
      const fullAgent = await window.service.agentInstance.getAgent(agentId);
      
      if (!fullAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const processedData = await get().processAgentData(fullAgent);
      
      set({
        agent: processedData.agent,
        agentDef: processedData.agentDef,
        messages: processedData.messages,
        orderedMessageIds: processedData.orderedMessageIds,
        error: null,
        loading: false,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to load agent:', error);
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (agentDefinitionId?: string): Promise<AgentWithoutMessages | null> => {
    try {
      set({ loading: true });
      const fullAgent = await window.service.agentInstance.createAgent(agentDefinitionId);

      // Process agent data using our helper method and await agentDef loading
      const processedData = await get().processAgentData(fullAgent);
      
      set({
        agent: processedData.agent,
        agentDef: processedData.agentDef,
        messages: processedData.messages,
        orderedMessageIds: processedData.orderedMessageIds,
        error: null,
        loading: false,
      });

      return processedData.agent;
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to create agent:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  updateAgent: async (data: Partial<AgentInstance>): Promise<AgentWithoutMessages | null> => {
    const storeAgent = get().agent;
    if (!storeAgent?.id) {
      set({ error: new Error('No active agent in store') });
      return null;
    }

    try {
      set({ loading: true });
      const updatedAgent = await window.service.agentInstance.updateAgent(storeAgent.id, data);

      // Process agent data using our helper method
      const processedData = await get().processAgentData(updatedAgent);
      
      set({
        agent: processedData.agent,
        agentDef: processedData.agentDef,
        messages: processedData.messages,
        orderedMessageIds: processedData.orderedMessageIds,
        error: null,
        loading: false,
      });

      return processedData.agent;
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to update agent:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  cancelAgent: async () => {
    const storeAgent = get().agent;
    if (!storeAgent?.id) {
      set({ error: new Error('No active agent in store') });
      return;
    }

    try {
      set({ loading: true });
      await window.service.agentInstance.cancelAgent(storeAgent.id);
    } catch (error) {
      set({ error: error instanceof Error ? error : new Error(String(error)) });
      console.error('Failed to cancel agent:', error);
    } finally {
      set({ loading: false });
    }
  },

  getHandlerId: async () => {
    try {
      set({ loading: true });
      const storeAgent = get().agent;
      if (storeAgent?.agentDefId) {
        // 从缓存的 agentDef 获取 handlerId
        const agentDef = get().agentDef;
        if (agentDef?.handlerID) {
          return agentDef.handlerID;
        }
        
        // 如果缓存中没有,则重新加载
        const agentDef2 = await window.service.agentDefinition.getAgentDef(storeAgent.agentDefId);
        const handlerId = agentDef2?.handlerID;
        if (handlerId) {
          return handlerId;
        }
        throw new Error('Handler ID not found in Agent definition.');
      } else {
        throw new Error('No active Agent or Agent Definition ID in store, cannot get Handler ID.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finalError = new Error(`Failed to get handler ID: ${errorMessage}`);
      set({ error: finalError });
      throw finalError;
    } finally {
      set({ loading: false });
    }
  },
});