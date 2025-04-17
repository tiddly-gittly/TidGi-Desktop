import SettingsIcon from '@mui/icons-material/Settings';
import { Button } from '@mui/material';
import { ProviderError } from '@services/agent/server/schema';
import { PreferenceSections } from '@services/preferences/interface';
import { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Conversation } from '../store';

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

const ConfigErrorBox = styled.div`
  margin-top: 8px;
  padding: 8px 12px;
  background-color: ${props => props.theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)'};
  border-radius: 6px;
  border-left: 3px solid ${props => props.theme.palette.warning.main};
`;

const ConfigErrorTitle = styled.div`
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 4px;
  color: ${props => props.theme.palette.warning.main};
`;

const ConfigErrorMessage = styled.div`
  font-size: 0.85rem;
  margin-bottom: 8px;
`;

const SettingsButton = styled(Button)`
  font-size: 0.8rem;
  text-transform: none;
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
  const [configError, setConfigError] = useState<ProviderError | null>(null);
  const [displayText, setDisplayText] = useState('');
  const { t } = useTranslation('agent');

  // 检测是否包含配置错误信息
  useEffect(() => {
    // 重置错误状态
    setIsError(false);
    setConfigError(null);

    // DEBUG: console conversation
    console.log(`conversation`, conversation);
    // 如果有完整的消息对象，先检查是否有错误部分
    if (conversation.message?.parts && Array.isArray(conversation.message.parts)) {
      // 查找错误类型的部分
      const errorPart = conversation.message.parts.find(part => part.type === 'error' && 'error' in part);

      if (errorPart && 'error' in errorPart) {
        // 找到错误信息，设置错误状态
        setIsError(true);
        setConfigError(errorPart.error);

        // 保留纯文本内容显示
        const textParts = conversation.message.parts
          .filter(part => 'text' in part)
          .map(part => (part as any).text)
          .join('\n');

        setDisplayText(textParts || conversation.response || '');
        return;
      }
    }

    // 如果消息中没有结构化错误但响应以"Error:"开头，也标记为错误
    const hasErrorPrefix = conversation.response &&
      (conversation.response.includes('Error:') ||
        conversation.response.includes('(无响应'));

    if (hasErrorPrefix) {
      setIsError(true);
      // 没有结构化错误信息，但仍然是错误
      setDisplayText(conversation.response || '');
    } else {
      // 普通消息
      setDisplayText(conversation.response || '');
    }
  }, [conversation.response, conversation.message]);

  // 格式化配置错误消息
  const getConfigErrorMessage = (error: ProviderError) => {
    switch (error.code) {
      case 'MISSING_API_KEY':
        return t('Chat.ConfigError.MissingAPIKey', { provider: error.provider });
      case 'MISSING_BASE_URL':
        return t('Chat.ConfigError.MissingBaseURL', { provider: error.provider });
      case 'AUTHENTICATION_FAILED':
        return t('Chat.ConfigError.AuthenticationFailed', { provider: error.provider });
      case 'MODEL_NOT_FOUND':
        return t('Chat.ConfigError.ModelNotFound', { provider: error.provider });
      case 'RATE_LIMIT_EXCEEDED':
        return t('Chat.ConfigError.RateLimitExceeded', { provider: error.provider });
      case 'PROVIDER_NOT_FOUND':
        return t('Chat.ConfigError.ProviderNotFound', { provider: error.provider });
      default:
        return t('Chat.ConfigError.GeneralError', { provider: error.provider });
    }
  };

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

      <MessageBubble isStreaming={isStreaming} isError={isError}>
        {isError && <ErrorIcon>⚠️</ErrorIcon>}
        {displayText || (isStreaming ? '' : t('Chat.WaitingForResponse'))}

        {configError && (
          <ConfigErrorBox>
            <ConfigErrorTitle>{t('Chat.ConfigError.Title')}</ConfigErrorTitle>
            <ConfigErrorMessage>{getConfigErrorMessage(configError)}</ConfigErrorMessage>
            <SettingsButton
              variant='outlined'
              size='small'
              color='warning'
              startIcon={<SettingsIcon />}
              onClick={async () => {
                await window.service.window.open(WindowNames.preferences, { preferenceGotoTab: PreferenceSections.externalAPI } as WindowMeta[WindowNames.preferences]);
              }}
            >
              {t('Chat.ConfigError.GoToSettings')}
            </SettingsButton>
          </ConfigErrorBox>
        )}

        {isStreaming && <StreamingIndicator>{t('Chat.Typing')}</StreamingIndicator>}
        <MessageTime>{formatTime(conversation.updatedAt)}</MessageTime>
      </MessageBubble>
    </>
  );
};
