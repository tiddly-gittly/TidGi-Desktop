import React, { useCallback, useEffect } from 'react';
import { ChatSessionUI } from './ChatSessionUI';
import { useAgentStore, useAgentStoreInitialization } from './store';

export function AgentSessions(): React.JSX.Element {
  // 初始化store
  useAgentStoreInitialization();

  const sessions = useAgentStore(state => state.sessions);
  const activeSessionId = useAgentStore(state => state.activeSessionId);
  const createNewSession = useAgentStore(state => state.createNewSession);
  const selectSession = useAgentStore(state => state.selectSession);
  const deleteSession = useAgentStore(state => state.deleteSession);
  const sendMessage = useAgentStore(state => state.sendMessageToAI);
  const cancelRequest = useAgentStore(state => state.cancelAIRequest);
  const isSessionLoading = useAgentStore(state => state.isSessionLoading);
  const isSessionStreaming = useAgentStore(state => state.isSessionStreaming);

  // 获取当前活跃会话的状态
  const isLoading = activeSessionId ? isSessionLoading(activeSessionId) : false;
  const isStreaming = activeSessionId ? isSessionStreaming(activeSessionId) : false;

  // 处理会话选择
  const handleSelectSession = useCallback((id: string) => {
    selectSession(id);
  }, [selectSession]);

  // 包装sendMessage方法，带错误处理
  const handleSendMessage = useCallback(async (message: string) => {
    try {
      if (!activeSessionId && sessions.length === 0) {
        // 如果没有活跃会话且没有任何会话，先创建一个
        const newSessionId = createNewSession();
        await sendMessage(message, newSessionId);
      } else {
        await sendMessage(message, activeSessionId);
      }
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  }, [activeSessionId, sessions.length, createNewSession, sendMessage]);

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
      onNewSession={createNewSession}
      onSelectSession={handleSelectSession}
      onDeleteSession={deleteSession}
      onSendMessage={handleSendMessage}
      onCancelRequest={handleCancelRequest}
      isLoading={isLoading}
      isStreaming={isStreaming}
    />
  );
}
