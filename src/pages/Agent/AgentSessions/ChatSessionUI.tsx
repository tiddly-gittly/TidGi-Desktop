import React from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';

import { AgentTask } from '@services/agent/interface';
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
import { Conversation, useAgentStore } from './store';

const ChatContainer = styled.div`
  display: flex;
  height: 100%;
  background-color: ${props => props.theme.palette.background.default};
  color: ${props => props.theme.palette.text.primary};
  overflow: hidden;
`;

interface ChatProps {
  tasks: AgentTask[];
  activeTaskId?: string;
  isLoading?: boolean;
  isStreaming?: boolean;
  availableAgents?: { id: string; name: string }[];
  selectedAgentId?: string;
  onNewTask: () => void;
  onSelectTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onSendMessage: (message: string) => void;
  onCancelRequest: () => void;
  onSelectAgent?: (agentId: string) => void;
}

export const ChatSessionUI: React.FC<ChatProps> = ({
  tasks,
  activeTaskId,
  isLoading,
  isStreaming,
  availableAgents = [],
  selectedAgentId,
  onNewTask,
  onSelectTask,
  onDeleteTask,
  onSendMessage,
  onCancelRequest,
  onSelectAgent,
}) => {
  const { t } = useTranslation('agent');
  const activeTask = tasks.find(task => task.id === activeTaskId);
  const getTaskConversations = useAgentStore(state => state.getTaskConversations);

  // 根据创建日期对任务进行分组
  const groupTasks = () => {
    const today: AgentTask[] = [];
    const yesterday: AgentTask[] = [];
    const older: AgentTask[] = [];

    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

    tasks.forEach(task => {
      if (!task.createdAt) {
        today.push(task);
        return;
      }

      const taskDate = new Date(task.createdAt).getTime();

      if (taskDate >= todayDate) {
        today.push(task);
      } else if (taskDate >= yesterdayDate) {
        yesterday.push(task);
      } else {
        older.push(task);
      }
    });

    // 按照日期倒序排序每个组中的任务，让最新的任务显示在最上面
    const sortTasksByDate = (tasks: AgentTask[]) => {
      return [...tasks].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // 倒序排列
      });
    };

    // 返回分组，今天的任务显示在最上面，昨天的任务其次，最旧的任务最下面
    const result = [];

    if (today.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Today', { ns: 'agent' }), sessions: sortTasksByDate(today) });
    }

    if (yesterday.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Yesterday', { ns: 'agent' }), sessions: sortTasksByDate(yesterday) });
    }

    if (older.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Older', { ns: 'agent' }), sessions: sortTasksByDate(older) });
    }

    return result;
  };

  // 将AgentTask转换为适合SessionListItem的格式
  const convertTaskForDisplay = (task: AgentTask) => {
    const conversations = getTaskConversations(task.id) || [];
    return {
      id: task.id || '',
      title: task.title || conversations[0]?.question?.slice(0, 30) || task.id,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      conversations: conversations,
    };
  };

  return (
    <ChatContainer>
      <SessionsList>
        <SessionsHeader onNewSession={onNewTask} />
        {groupTasks().map(group => (
          <SessionsGroup key={group.heading} heading={group.heading}>
            {group.sessions.map(task => (
              <SessionListItem
                key={task.id || ''}
                session={convertTaskForDisplay(task)}
                isActive={task.id === activeTaskId}
                onSelect={onSelectTask}
                onDelete={onDeleteTask}
              />
            ))}
          </SessionsGroup>
        ))}
      </SessionsList>

      {activeTask
        ? (
          <SessionMessagePanel>
            <SessionMessagesHeader
              title={activeTask.title ||
                getTaskConversations(activeTask.id)[0]?.question?.slice(0, 30) ||
                `${t('Chat.Session', { ns: 'agent' })} ${activeTask.id}`}
              sessionId={activeTask.id}
            />
            <SessionMessages>
              {getTaskConversations(activeTask.id).map((conversation: Conversation) => (
                <SessionMessage
                  key={conversation.id}
                  conversation={conversation}
                  isStreaming={isStreaming && conversation.id === `${activeTask.id}-${getTaskConversations(activeTask.id).length - 1}`}
                />
              ))}
              {isLoading && <LoadingIndicator message={t('Chat.Thinking', { ns: 'agent' })} />}
            </SessionMessages>
            <ChatInput
              onSendMessage={onSendMessage}
              onCancelRequest={onCancelRequest}
              isLoading={isLoading}
              isStreaming={isStreaming}
            />
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
