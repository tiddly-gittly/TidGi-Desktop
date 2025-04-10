import { Conversation } from '@services/externalAPI/interface';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

const MessageBubble = styled.div<{ isUser?: boolean; isStreaming?: boolean; isError?: boolean }>`
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
  align-self: ${props => (props.isUser ? 'flex-end' : 'flex-start')};
  background-color: ${props => {
  if (props.isUser) return props.theme.palette.primary.main;
  if (props.isError) return props.theme.palette.mode === 'dark' ? 'rgba(255, 0, 0, 0.15)' : 'rgba(255, 0, 0, 0.05)';
  return props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
}};
  color: ${props => {
  if (props.isUser) return props.theme.palette.primary.contrastText;
  if (props.isError) return props.theme.palette.error.main;
  return props.theme.palette.text.primary;
}};
  word-break: break-word;
  
  ${props =>
  props.isStreaming && `
    border-bottom: 2px solid ${props.theme.palette.primary.main};
    animation: pulse 1.5s infinite;
    
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.8; }
      100% { opacity: 1; }
    }
  `}
`;

const MessageTime = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.palette.text.secondary};
  margin-top: 4px;
  text-align: right;
`;

const StreamingIndicator = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.palette.primary.main};
  margin-top: 4px;
  font-style: italic;
`;

const ErrorIcon = styled.span`
  color: ${props => props.theme.palette.error.main};
  margin-right: 6px;
`;

interface SessionMessageProps {
  conversation: Conversation;
  isStreaming?: boolean;
}

export const SessionMessage: React.FC<SessionMessageProps> = ({
  conversation,
  isStreaming,
}) => {
  const [isError, setIsError] = useState(false);

  // 检测响应是否是错误消息
  useEffect(() => {
    if (
      conversation.response && (
        conversation.response.startsWith('Error:') ||
        conversation.response.startsWith('(无响应')
      )
    ) {
      setIsError(true);
    } else {
      setIsError(false);
    }
  }, [conversation.response]);

  // 调试输出
  useEffect(() => {
    console.log(
      'SessionMessage render:',
      'id:',
      conversation.id,
      'isStreaming:',
      isStreaming,
      'response:',
      conversation.response ? conversation.response.substring(0, 50) : '(empty)',
    );
  }, [conversation.id, isStreaming, conversation.response]);

  const formatTime = (date?: Date) => {
    if (!date) return '';
    return date instanceof Date
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <MessageBubble isUser>
        {conversation.question}
        <MessageTime>{formatTime(conversation.createdAt)}</MessageTime>
      </MessageBubble>

      {/* 一律显示AI的响应消息框，即使没有内容 */}
      <MessageBubble isStreaming={isStreaming} isError={isError}>
        {isError && <ErrorIcon>⚠️</ErrorIcon>}
        {conversation.response || (isStreaming ? '' : '(等待响应中...)')}
        {isStreaming && <StreamingIndicator>正在输入中...</StreamingIndicator>}
        <MessageTime>{formatTime(conversation.updatedAt)}</MessageTime>
      </MessageBubble>
    </>
  );
};
