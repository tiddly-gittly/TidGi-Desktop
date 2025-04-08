import React, { useCallback } from 'react';
import { ChatSessionUI } from './ChatSessionUI';
import { useAgentStore } from './store';

export function AgentSessions(): React.JSX.Element {
  const sessions = useAgentStore(state => state.sessions);
  const activeSessionId = useAgentStore(state => state.activeSessionId);
  const createNewSession = useAgentStore(state => state.createNewSession);
  const selectSession = useAgentStore(state => state.selectSession);
  const deleteSession = useAgentStore(state => state.deleteSession);
  const sendMessage = useAgentStore(state => state.sendMessage);
  const isSessionLoading = useAgentStore(state => state.isSessionLoading);

  // 获取当前活跃会话的loading状态
  const isLoading = activeSessionId ? isSessionLoading(activeSessionId) : false;

  // 处理会话选择
  const handleSelectSession = useCallback((id: string) => {
    selectSession(id);
  }, [selectSession]);

  // 包装sendMessage方法，默认使用activeSessionId
  const handleSendMessage = useCallback((message: string) => {
    if (!activeSessionId && sessions.length === 0) {
      // 如果没有活跃会话且没有任何会话，先创建一个
      const newSessionId = createNewSession();
      sendMessage(message, newSessionId);
    } else {
      sendMessage(message, activeSessionId);
    }
  }, [activeSessionId, sessions.length, createNewSession, sendMessage]);

  return (
    <ChatSessionUI
      sessions={sessions}
      activeSessionId={activeSessionId}
      onNewSession={createNewSession}
      onSelectSession={handleSelectSession}
      onDeleteSession={deleteSession}
      onSendMessage={handleSendMessage}
      isLoading={isLoading}
    />
  );
}
