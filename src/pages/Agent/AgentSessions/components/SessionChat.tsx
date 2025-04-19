import { CircularProgress, Divider, Typography } from '@mui/material';
import { processPrompts } from '@services/agent/defaultAgents/promptProcessor';
import { AgentTask } from '@services/agent/interfaces';
import { CoreMessage } from 'ai';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { ChatInput } from './ChatInput';
import { PromptPreviewDialog } from './PromptPreviewDialog';

// 样式组件
const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const EmptyState = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 16px;
`;

const MessageWrapper = styled.div<{ isUser: boolean }>`
  display: flex;
  flex-direction: column;
  max-width: 80%;
  align-self: ${props => props.isUser ? 'flex-end' : 'flex-start'};
  padding: 10px 16px;
  border-radius: 12px;
  background-color: ${props =>
  props.isUser
    ? props.theme.palette.primary.main
    : props.theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.1)'
    : 'rgba(0, 0, 0, 0.05)'};
  color: ${props =>
  props.isUser
    ? props.theme.palette.primary.contrastText
    : props.theme.palette.text.primary};
`;

const Role = styled.div<{ isUser: boolean }>`
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: ${props =>
  props.isUser
    ? props.theme.palette.primary.contrastText
    : props.theme.palette.text.secondary};
`;

const MessageContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Text = styled.div`
  white-space: pre-wrap;
  word-break: break-word;
`;

const Error = styled.div`
  color: ${props => props.theme.palette.error.main};
  background-color: ${props => props.theme.palette.error.light};
  padding: 8px;
  border-radius: 4px;
  font-size: 0.875rem;
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
`;

interface SessionChatProps {
  session: AgentTask;
  onSendMessage: (message: string) => void;
  onCancelRequest: () => void;
  isLoading: boolean;
  isStreaming: boolean;
  agentConfig?: any; // 代理配置
}

export const SessionChat: React.FC<SessionChatProps> = ({
  session,
  onSendMessage,
  onCancelRequest,
  isLoading,
  isStreaming,
  agentConfig,
}) => {
  const { t } = useTranslation('agent');
  const messagesEndReference = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewPrompts, setPreviewPrompts] = useState<CoreMessage[]>([]);
  const [processedPrompts, setProcessedPrompts] = useState<any>(null);

  // 滚动到最新消息
  useEffect(() => {
    if (messagesEndReference.current) {
      messagesEndReference.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session.messages]);

  // 处理提示词预览
  const handlePreviewPrompts = () => {
    if (!agentConfig) return;

    try {
      // 使用纯函数处理提示词
      const { flatPrompts, processedPrompts } = processPrompts(agentConfig, {
        history: session.messages,
        userMessage: '预览消息', // 模拟用户输入
      });

      setPreviewPrompts(flatPrompts);
      setProcessedPrompts(processedPrompts);
      setPreviewOpen(true);
    } catch (error) {
      console.error('Error processing prompts for preview:', error);
    }
  };

  return (
    <ChatContainer>
      {session.messages.length === 0
        ? (
          <EmptyState>
            <Typography variant='body1' color='textSecondary'>
              {t('Chat.EmptyState', { ns: 'agent' })}
            </Typography>
          </EmptyState>
        )
        : (
          <MessagesContainer>
            {session.messages.map((message, index) => (
              <MessageWrapper
                key={`message-${index}`}
                isUser={message.role === 'user'}
              >
                <Role isUser={message.role === 'user'}>
                  {message.role === 'user' ? t('Chat.User', { ns: 'agent' }) : t('Chat.Agent', { ns: 'agent' })}
                </Role>
                <MessageContent>
                  {message.parts.map((part, partIndex) => {
                    if ('text' in part) {
                      return <Text key={`part-${partIndex}`}>{part.text}</Text>;
                    } else if ('error' in part) {
                      return (
                        <Error key={`part-${partIndex}`}>
                          {t('Chat.Error', { ns: 'agent' })}: {part.error.code} - {part.error.name}
                        </Error>
                      );
                    } else {
                      return <Text key={`part-${partIndex}`}>{t('Chat.UnsupportedContent', { ns: 'agent' })}</Text>;
                    }
                  })}
                </MessageContent>
              </MessageWrapper>
            ))}
            <div ref={messagesEndReference} />

            {isLoading && !isStreaming && (
              <LoadingState>
                <CircularProgress size={24} />
                <Typography variant='body2' color='textSecondary'>
                  {t('Chat.Loading', { ns: 'agent' })}
                </Typography>
              </LoadingState>
            )}
          </MessagesContainer>
        )}
      <Divider />
      <ChatInput
        onSendMessage={onSendMessage}
        onCancelRequest={onCancelRequest}
        onPreviewPrompts={agentConfig ? handlePreviewPrompts : undefined}
        isLoading={isLoading}
        isStreaming={isStreaming}
      />

      {/* 提示词预览对话框 */}
      <PromptPreviewDialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
        }}
        prompts={previewPrompts}
        rawPrompts={processedPrompts}
      />
    </ChatContainer>
  );
};
