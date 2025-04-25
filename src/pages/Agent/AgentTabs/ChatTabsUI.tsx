import React from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';

import { AgentTask } from '@services/agent/interface';
import { ChatInput } from './components/ChatInput';
import { EmptyState } from './components/EmptyState';
import { LoadingIndicator } from './components/LoadingIndicator';
import { TaskListItem } from './components/TaskListItem';
import { TaskMessage } from './components/TaskMessage';
import { TaskMessages } from './components/TaskMessages';
import { TaskMessagesHeader } from './components/TaskMessagesHeader';
import { TasksGroup } from './components/TasksGroup';
import { TasksList } from './components/TasksList';
import { TasksListHeader } from './components/TasksListHeader';
import { useAgentStore } from './store';

const ChatContainer = styled.div`
  display: flex;
  height: 100%;
  background-color: ${props => props.theme.palette.background.default};
  color: ${props => props.theme.palette.text.primary};
  overflow: hidden;
`;

const Panel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;
const SessionMessagePanel: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return <Panel>{children}</Panel>;
};

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

export const ChatTabsUI: React.FC<ChatProps> = ({
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
  const getTaskMessages = useAgentStore(state => state.getTaskMessages);

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
      result.push({ heading: t('Chat.SessionGroup.Today'), sessions: sortTasksByDate(today) });
    }

    if (yesterday.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Yesterday'), sessions: sortTasksByDate(yesterday) });
    }

    if (older.length > 0) {
      result.push({ heading: t('Chat.SessionGroup.Older'), sessions: sortTasksByDate(older) });
    }

    return result;
  };

  return (
    <ChatContainer>
      <TasksList>
        <TasksListHeader onNewSession={onNewTask} />
        {groupTasks().map(group => (
          <TasksGroup key={group.heading} heading={group.heading}>
            {group.sessions.map(task => (
              <TaskListItem
                key={task.id || ''}
                task={task}
                isActive={task.id === activeTaskId}
                onSelect={onSelectTask}
                onDelete={onDeleteTask}
              />
            ))}
          </TasksGroup>
        ))}
      </TasksList>

      {activeTask
        ? (
          <SessionMessagePanel>
            <TaskMessagesHeader
              title={activeTask.name ||
                // 获取第一条用户消息作为标题
                getTaskMessages(activeTask.id).find(m => m.role === 'user')?.parts
                  .filter(part => 'text' in part)
                  .map(part => 'text' in part ? part.text : '')
                  .join('')
                  .slice(0, 30) ||
                `${t('Chat.Session')} ${activeTask.id}`}
              taskId={activeTask.id}
            />
            <TaskMessages>
              {getTaskMessages(activeTask.id).map((message) => (
                <TaskMessage
                  key={`${activeTask.id}-${
                    // Try to get a unique identifier from the message
                    String(message.metadata?.id) ||
                    String(message.metadata?.created) ||
                    String(Math.random())}`}
                  message={message}
                  isStreaming={isStreaming &&
                    message.role === 'agent' &&
                    message === getTaskMessages(activeTask.id).filter(m => m.role === 'agent').slice(-1)[0]}
                />
              ))}
              {isLoading && <LoadingIndicator message={t('Chat.Thinking')} />}
            </TaskMessages>
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
            heading={t('Chat.StartNewConversation')}
            description={t('Chat.EmptyStateDescription')}
          />
        )}
    </ChatContainer>
  );
};
