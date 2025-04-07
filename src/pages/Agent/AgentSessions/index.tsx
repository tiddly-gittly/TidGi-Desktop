import React from 'react';
import {
  Chat,
  ChatInput,
  NewSessionButton,
  SessionGroups,
  SessionListItem,
  SessionMessage,
  SessionMessages,
  SessionMessagePanel,
  SessionMessagesHeader,
  SessionsGroup,
  SessionsList,
  Session,
} from 'reachat';
import { useAgentStore } from './store';

export function AgentSessions(): React.JSX.Element {
  // 从store中获取状态和操作
  const {
    sessions,
    activeSessionId,
    createNewSession,
    deleteSession,
    selectSession,
    sendMessage,
    isSessionLoading,
  } = useAgentStore();
  
  // 将AgentState转换为reachat需要的Session格式
  const formattedSessions: Session[] = sessions.map(session => ({
    id: session.id || '',
    title: session.title || '',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    conversations: session.conversations || [],
  }));
  
  // 获取当前活跃会话的loading状态
  const isLoading = activeSessionId ? isSessionLoading(activeSessionId) : false;
  
  // 包装sendMessage方法，默认使用activeSessionId
  const handleSendMessage = (message: string) => {
    sendMessage(message, activeSessionId);
  };

  return (
    <Chat
      sessions={formattedSessions}
      activeSessionId={activeSessionId}
      onNewSession={createNewSession}
      onSelectSession={selectSession}
      onDeleteSession={deleteSession}
      onSendMessage={handleSendMessage}
      isLoading={isLoading}
    >
      <SessionsList>
        <NewSessionButton />
        <SessionGroups>
          {(groups) =>
            groups.map(({ heading, sessions }) => (
              <SessionsGroup heading={heading} key={heading}>
                {sessions.map((s) => (
                  <SessionListItem key={s.id} session={s} />
                ))}
              </SessionsGroup>
            ))
          }
        </SessionGroups>
      </SessionsList>
      <SessionMessagePanel>
        <SessionMessagesHeader />
        <SessionMessages>
          {(conversations) =>
            conversations.map((conversation) => (
              <SessionMessage
                key={conversation.id}
                conversation={conversation}
              />
            ))
          }
        </SessionMessages>
        <ChatInput />
      </SessionMessagePanel>
    </Chat>
  );
}
