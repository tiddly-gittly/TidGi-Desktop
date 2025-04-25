import React, { useEffect } from 'react';
import { useRoute } from 'wouter';
import { useAgentStore } from '../AgentTabs/store';
import { SessionMessagePanel } from './components/SessionMessagePanel';
import { TaskMessagesHeader } from '../AgentTabs/components/TaskMessagesHeader';
import { TaskMessages } from '../AgentTabs/components/TaskMessages';
import { TaskMessage } from '../AgentTabs/components/TaskMessage';
import { LoadingIndicator } from '../AgentTabs/components/LoadingIndicator';
import { ChatInput } from '../AgentTabs/components/ChatInput';

export function ChatDetail(): React.JSX.Element {
  const [match, params] = useRoute('/session/:taskId');
  const taskId = params?.taskId;
  
  const tasks = useAgentStore(state => state.tasks);
  const sendMessage = useAgentStore(state => state.sendMessage);
  const cancelRequest = useAgentStore(state => state.cancelRequest);
  const getTaskMessages = useAgentStore(state => state.getTaskMessages);
  const setActiveTaskId = useAgentStore(state => state.setActiveTaskId);
  const isLoading = useAgentStore(state => state.loading);
  const isStreaming = useAgentStore(state => state.streaming);
  
  // 当组件挂载或taskId变化时，设置活动任务ID
  useEffect(() => {
    if (taskId) {
      setActiveTaskId(taskId);
    }
  }, [taskId, setActiveTaskId]);
  
  // 如果没有匹配的路由或任务ID不存在，返回空
  if (!match || !taskId) {
    return <div>未找到会话</div>;
  }
  
  const activeTask = tasks.find(task => task.id === taskId);
  
  if (!activeTask) {
    return <div>未找到会话</div>;
  }
  
  const handleSendMessage = (message: string) => {
    if (taskId) {
      sendMessage(taskId, message);
    }
  };
  
  return (
    <SessionMessagePanel>
      <TaskMessagesHeader
        title={activeTask.name ||
          // 获取第一条用户消息作为标题
          getTaskMessages(activeTask.id).find(m => m.role === 'user')?.parts
            .filter(part => 'text' in part)
            .map(part => 'text' in part ? part.text : '')
            .join('')
            .slice(0, 30) ||
          `会话 ${activeTask.id}`}
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
        {isLoading && <LoadingIndicator message="思考中..." />}
      </TaskMessages>
      <ChatInput
        onSendMessage={handleSendMessage}
        onCancelRequest={cancelRequest}
        isLoading={isLoading}
        isStreaming={isStreaming}
      />
    </SessionMessagePanel>
  );
}