import { Conversation } from 'reachat';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';

import { ChatInput } from './components/ChatInput';
import { EmptyState } from './components/EmptyState';
import { LoadingIndicator } from './components/LoadingIndicator';
import { SessionListItem } from './components/SessionListItem';
import { SessionMessage } from './components/SessionMessage';
import { SessionMessagePanel } from './components/SessionMessagePanel';
import { SessionMessages } from './components/SessionMessages';
import { SessionMessagesHeader } from './components/SessionMessagesHeader';
import { SessionsGroup } from './components/SessionsGroup';
import { SessionsHeader } from './components/SessionsHeader';
import { SessionsList } from './components/SessionsList';

const ChatContainer = styled.div`
  display: flex;
  height: 100%;
  background-color: ${props => props.theme.palette.background.default};
  color: ${props => props.theme.palette.text.primary};
  overflow: hidden;
`;

// 组件实现
export interface ChatSession {
  id: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
  conversations: Conversation[];
}

interface ChatProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  isLoading?: boolean;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onSendMessage: (message: string) => void;
}

export const ChatSessionUI: React.FC<ChatProps> = ({
  sessions,
  activeSessionId,
  isLoading,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onSendMessage,
}) => {
  const { t } = useTranslation('agent');
  const activeSession = sessions.find(session => session.id === activeSessionId);

  // 根据创建日期对会话进行分组
  const groupSessions = () => {
    const today: ChatSession[] = [];
    const yesterday: ChatSession[] = [];
    const older: ChatSession[] = [];

    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

    sessions.forEach(session => {
      if (!session.createdAt) {
        today.push(session);
        return;
      }

      const sessionDate = new Date(session.createdAt).getTime();

      if (sessionDate >= todayDate) {
        today.push(session);
      } else if (sessionDate >= yesterdayDate) {
        yesterday.push(session);
      } else {
        older.push(session);
      }
    });

    const result = [];

    if (today.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Today', { ns: 'agent' }), sessions: today });
    }

    if (yesterday.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Yesterday', { ns: 'agent' }), sessions: yesterday });
    }

    if (older.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Older', { ns: 'agent' }), sessions: older });
    }

    return result;
  };

  return (
    <ChatContainer>
      <SessionsList>
        <SessionsHeader onNewSession={onNewSession} />
        {groupSessions().map(group => (
          <SessionsGroup key={group.heading} heading={group.heading}>
            {group.sessions.map(session => (
              <SessionListItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={onSelectSession}
                onDelete={onDeleteSession}
              />
            ))}
          </SessionsGroup>
        ))}
      </SessionsList>

      {activeSession
        ? (
          <SessionMessagePanel>
            <SessionMessagesHeader title={activeSession.title || `${t('Chat.Session', { ns: 'agent' })} ${activeSession.id}`} />
            <SessionMessages>
              {activeSession.conversations.map(conversation => (
                <SessionMessage
                  key={conversation.id}
                  conversation={conversation}
                />
              ))}
              {isLoading && <LoadingIndicator message={t('Chat.Thinking', { ns: 'agent' })} />}
            </SessionMessages>
            <ChatInput onSendMessage={onSendMessage} isLoading={isLoading} />
          </SessionMessagePanel>
        )
        : (
          <EmptyState
            heading={t('Chat.StartNewConversation', { ns: 'agent' })}
            description={t('Chat.EmptyStateDescription', { ns: 'agent' })}
          />
        )}
    </ChatContainer>
  );
};
