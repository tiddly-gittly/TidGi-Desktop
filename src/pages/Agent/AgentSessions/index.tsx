import React, { useCallback, useEffect } from 'react';
import { ChatSessionUI } from './ChatSessionUI';
import { useAgentStore, useAgentStoreInitialization } from './store';

export function AgentSessions(): React.JSX.Element {
  // 初始化store
  useAgentStoreInitialization();

  const sessions = useAgentStore(state => state.sessions);
  const activeSessionId = useAgentStore(state => state.activeSessionId);
  const availableAgents = useAgentStore(state => state.availableAgents);
  const selectedAgentId = useAgentStore(state => state.selectedAgentId);
  const createNewSession = useAgentStore(state => state.createNewSession);
  const selectSession = useAgentStore(state => state.selectSession);
  const deleteSession = useAgentStore(state => state.deleteSession);
  const sendMessage = useAgentStore(state => state.sendMessageToAI);
  const cancelRequest = useAgentStore(state => state.cancelAIRequest);
  const selectAgent = useAgentStore(state => state.selectAgent);
  const isSessionLoading = useAgentStore(state => state.isSessionLoading);
  const isSessionStreaming = useAgentStore(state => state.isSessionStreaming);
  const isCreatingSession = useAgentStore(state => state.creatingSession);

  // 获取当前活跃会话的状态
  const isLoading = activeSessionId ? isSessionLoading(activeSessionId) : false;
  const isStreaming = activeSessionId ? isSessionStreaming(activeSessionId) : false;

  // 处理会话选择
  const handleSelectSession = useCallback((id: string) => {
    selectSession(id);
  }, [selectSession]);

  // 处理智能体选择
  const handleSelectAgent = useCallback((agentId: string) => {
    selectAgent(agentId);
  }, [selectAgent]);

  // 包装创建会话方法，使用async/await处理
  const handleNewSession = useCallback(async () => {
    try {
      // 检查是否有选定的智能体
      const currentAgentId = selectedAgentId;
      if (!currentAgentId && availableAgents.length > 0) {
        // 如果没有选定智能体但有可用智能体，先选择第一个
        selectAgent(availableAgents[0].id);
      }
      
      // 检查是否正在创建会话，避免重复点击
      if (isCreatingSession) {
        console.log('Already creating a session, please wait...');
        return;
      }
      
      const sessionId = await createNewSession();
      console.log('Created new session with ID:', sessionId);
      
      if (!sessionId) {
        console.error('Failed to create session: Empty session ID returned');
      }
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  }, [createNewSession, selectedAgentId, availableAgents, selectAgent, isCreatingSession]);

  // 包装sendMessage方法，带错误处理
  const handleSendMessage = useCallback(async (message: string) => {
    try {
      if (!activeSessionId) {
        // 如果没有活跃会话，先创建一个
        const newSessionId = await createNewSession();
        if (newSessionId) {
          await sendMessage(message, newSessionId);
        }
      } else {
        await sendMessage(message, activeSessionId);
      }
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  }, [activeSessionId, createNewSession, sendMessage]);

  // 包装cancelRequest方法，带错误处理
  const handleCancelRequest = useCallback(async () => {
    try {
      if (activeSessionId) {
        await cancelRequest(activeSessionId);
      }
    } catch (error) {
      console.error('取消请求失败:', error);
    }
  }, [activeSessionId, cancelRequest]);

  return (
    <ChatSessionUI
      sessions={sessions}
      activeSessionId={activeSessionId}
      availableAgents={availableAgents}
      selectedAgentId={selectedAgentId}
      onNewSession={handleNewSession}
      onSelectSession={handleSelectSession}
      onDeleteSession={deleteSession}
      onSendMessage={handleSendMessage}
      onCancelRequest={handleCancelRequest}
      onSelectAgent={handleSelectAgent}
      isLoading={isLoading || isCreatingSession}
      isStreaming={isStreaming}
    />
  );
}
