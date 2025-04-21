import React, { useCallback, useEffect } from 'react';
import { ChatSessionUI } from './ChatSessionUI';
import { useAgentStore, useAgentStoreInitialization } from './store';

export function AgentSessions(): React.JSX.Element {
  // 初始化store
  useAgentStoreInitialization();

  const tasks = useAgentStore(state => state.tasks);
  const activeTaskId = useAgentStore(state => state.activeTaskId);
  const availableAgents = useAgentStore(state => state.availableAgents);
  const selectedAgentId = useAgentStore(state => state.selectedAgentId);
  const createNewTask = useAgentStore(state => state.createNewTask);
  const selectTask = useAgentStore(state => state.selectTask);
  const deleteTask = useAgentStore(state => state.deleteTask);
  const sendMessage = useAgentStore(state => state.sendMessageToAI);
  const cancelRequest = useAgentStore(state => state.cancelAIRequest);
  const selectAgent = useAgentStore(state => state.selectAgent);
  const isTaskLoading = useAgentStore(state => state.isTaskLoading);
  const isTaskStreaming = useAgentStore(state => state.isTaskStreaming);
  const isCreatingTask = useAgentStore(state => state.creatingTask);

  // 获取当前活跃任务的状态
  const isLoading = activeTaskId ? isTaskLoading(activeTaskId) : false;
  const isStreaming = activeTaskId ? isTaskStreaming(activeTaskId) : false;

  // 处理任务选择
  const handleSelectTask = useCallback((id: string) => {
    selectTask(id);
  }, [selectTask]);

  // 处理智能体选择
  const handleSelectAgent = useCallback((agentId: string) => {
    selectAgent(agentId);
  }, [selectAgent]);

  // 包装创建任务方法，使用async/await处理
  const handleNewTask = useCallback(async () => {
    try {
      // 检查是否有选定的智能体
      const currentAgentId = selectedAgentId;
      if (!currentAgentId && availableAgents.length > 0) {
        // 如果没有选定智能体但有可用智能体，先选择第一个
        selectAgent(availableAgents[0].id);
      }
      
      // 检查是否正在创建任务，避免重复点击
      if (isCreatingTask) {
        console.log('Already creating a task, please wait...');
        return;
      }
      
      const taskId = await createNewTask();
      console.log('Created new task with ID:', taskId);
      
      if (!taskId) {
        console.error('Failed to create task: Empty task ID returned');
      }
    } catch (error) {
      console.error('Failed to create new task:', error);
    }
  }, [createNewTask, selectedAgentId, availableAgents, selectAgent, isCreatingTask]);

  // 包装sendMessage方法，带错误处理
  const handleSendMessage = useCallback(async (message: string) => {
    try {
      if (!activeTaskId) {
        // 如果没有活跃任务，先创建一个
        const newTaskId = await createNewTask();
        if (newTaskId) {
          await sendMessage(message, newTaskId);
        }
      } else {
        await sendMessage(message, activeTaskId);
      }
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  }, [activeTaskId, createNewTask, sendMessage]);

  // 包装cancelRequest方法，带错误处理
  const handleCancelRequest = useCallback(async () => {
    try {
      if (activeTaskId) {
        await cancelRequest(activeTaskId);
      }
    } catch (error) {
      console.error('Failed to cancel request:', error);
    }
  }, [activeTaskId, cancelRequest]);

  return (
    <ChatSessionUI
      tasks={tasks}
      activeTaskId={activeTaskId}
      availableAgents={availableAgents}
      selectedAgentId={selectedAgentId}
      onNewTask={handleNewTask}
      onSelectTask={handleSelectTask}
      onDeleteTask={deleteTask}
      onSendMessage={handleSendMessage}
      onCancelRequest={handleCancelRequest}
      onSelectAgent={handleSelectAgent}
      isLoading={isLoading || isCreatingTask}
      isStreaming={isStreaming}
    />
  );
}
