/* eslint-disable unicorn/prevent-abbreviations */
import { AgentInstance, AgentInstanceMessage } from '@services/agentInstance/interface';
import { useCallback, useEffect, useState } from 'react';

/**
 * 用于处理 Agent 聊天功能的 Hook
 * 使用 agentId 从后端获取数据，并提供操作聊天所需的方法
 */
export const useAgentChat = (agentId?: string, agentDefId?: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [agent, setAgent] = useState<AgentInstance | null>(null);
  const [messages, setMessages] = useState<AgentInstanceMessage[]>([]);

  // 获取 Agent 实例
  const fetchAgent = useCallback(async () => {
    if (!agentId) return;

    try {
      setLoading(true);
      setError(null);
      const result = await window.service.agentInstance.getAgent(agentId);
      if (result) {
        setAgent(result);
        setMessages(result.messages);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.error('Failed to fetch agent:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // 订阅 Agent 更新
  const subscribeToUpdates = useCallback(() => {
    if (!agentId) return;

    try {
      const subscription = window.observables.agentInstance.subscribeToAgentUpdates(agentId).subscribe({
        next: (updatedAgent) => {
          if (updatedAgent) {
            setAgent(updatedAgent);
            setMessages(updatedAgent.messages);
          }
        },
        error: (err) => {
          console.error('Error in agent subscription:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
        },
      });

      // 返回清除函数
      return () => {
        subscription.unsubscribe();
      };
    } catch (err) {
      console.error('Failed to subscribe to agent updates:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [agentId]);

  // 发送消息到 Agent
  const sendMessage = useCallback(async (content: string) => {
    if (!agentId) {
      setError(new Error('No agent ID provided'));
      return;
    }

    try {
      setLoading(true);
      await window.service.agentInstance.sendMsgToAgent(agentId, { text: content });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.error('Failed to send message:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // 创建新的 Agent 实例
  const createAgent = useCallback(async () => {
    try {
      setLoading(true);
      const newAgent = await window.service.agentInstance.createAgent(agentDefId);
      setAgent(newAgent);
      setMessages(newAgent.messages);
      return newAgent;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.error('Failed to create agent:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [agentDefId]);

  // 更新 Agent
  const updateAgent = useCallback(async (data: Partial<AgentInstance>) => {
    if (!agentId) {
      setError(new Error('No agent ID provided'));
      return;
    }

    try {
      setLoading(true);
      const updatedAgent = await window.service.agentInstance.updateAgent(agentId, data);
      setAgent(updatedAgent);
      setMessages(updatedAgent.messages);
      return updatedAgent;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.error('Failed to update agent:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // 取消当前操作
  const cancelAgent = useCallback(async () => {
    if (!agentId) return;

    try {
      await window.service.agentInstance.cancelAgent(agentId);
    } catch (err) {
      console.error('Failed to cancel agent:', err);
    }
  }, [agentId]);

  // 初始化
  useEffect(() => {
    if (agentId) {
      void fetchAgent();
      const cleanup = subscribeToUpdates();
      return cleanup;
    } else if (agentDefId) {
      // 如果没有 agentId 但有 agentDefId，则创建新的 Agent
      createAgent().catch(console.error);
    }
  }, [agentId, agentDefId, fetchAgent, subscribeToUpdates, createAgent]);

  return {
    agent,
    messages,
    loading,
    error,
    sendMessage,
    createAgent,
    updateAgent,
    cancelAgent,
  };
};
