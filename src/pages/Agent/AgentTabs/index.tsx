import React, { useCallback } from 'react';
import { useLocation } from 'wouter';
import { TaskListItem } from './components/TaskListItem';
import { TasksList } from './components/TasksList';
import { useAgentStore, useAgentStoreInitialization } from './store';

export function AgentTabs(): React.JSX.Element {
  // 初始化store
  useAgentStoreInitialization();

  const tasks = useAgentStore(state => state.tasks);
  const activeTaskId = useAgentStore(state => state.activeTaskId);
  const deleteTask = useAgentStore(state => state.deleteTask);

  const [, setLocation] = useLocation();

  // 处理任务选择
  const handleSelectTask = useCallback((id: string) => {
    setLocation(`/session/${id}`);
  }, [setLocation]);

  // 根据创建日期对任务进行分组
  const groupTasks = () => {
    const today: Array<typeof tasks[0]> = [];
    const yesterday: Array<typeof tasks[0]> = [];
    const older: Array<typeof tasks[0]> = [];

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

    const sortTasksByDate = (tasks: Array<typeof tasks[0]>) => {
      return [...tasks].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // 倒序排列
      });
    };

    // 返回分组
    const result = [];

    if (today.length > 0) {
      result.push({ heading: '今天', sessions: sortTasksByDate(today) });
    }

    if (yesterday.length > 0) {
      result.push({ heading: '昨天', sessions: sortTasksByDate(yesterday) });
    }

    if (older.length > 0) {
      result.push({ heading: '更早', sessions: sortTasksByDate(older) });
    }

    return result;
  };

  return (
    <TasksList>
      {groupTasks().map(group => (
        <TasksGroup key={group.heading} heading={group.heading}>
          {group.sessions.map(task => (
            <TaskListItem
              key={task.id || ''}
              task={task}
              isActive={task.id === activeTaskId}
              onSelect={handleSelectTask}
              onDelete={deleteTask}
            />
          ))}
        </TasksGroup>
      ))}
    </TasksList>
  );
}
