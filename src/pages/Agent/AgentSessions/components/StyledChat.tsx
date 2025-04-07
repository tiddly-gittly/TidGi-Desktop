import { Conversation } from 'reachat';
import React, { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

const ChatContainer = styled.div`
  display: flex;
  height: 100%;
  background-color: ${props => props.theme.palette.background.default};
  color: ${props => props.theme.palette.text.primary};
  overflow: hidden;
`;

const SessionsContainer = styled.div`
  width: ${props => props.theme.workflow?.run?.chatsList?.width || 280}px;
  border-right: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.palette.mode === 'dark' ? '#1e1e1e' : '#f0f2f5'};
`;

const SessionsHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
`;

const NewSessionBtn = styled.button`
  width: 100%;
  padding: 8px 16px;
  background-color: ${props => props.theme.palette.primary.main};
  color: ${props => props.theme.palette.primary.contrastText};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${props => props.theme.palette.primary.dark};
  }
`;

const SessionList = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
`;

const SessionGroup = styled.div`
  margin-bottom: 16px;
`;

const SessionGroupHeading = styled.h3`
  padding: 0 16px;
  margin: 8px 0;
  font-size: 0.9rem;
  color: ${props => props.theme.palette.text.secondary};
`;

const SessionItem = styled.div<{ active?: boolean }>`
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-left: 3px solid ${props => (props.active ? props.theme.palette.primary.main : 'transparent')};
  background-color: ${props => (props.active ? 
    (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)') : 
    'transparent')};
  
  &:hover {
    background-color: ${props => (props.active ? 
      (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)') : 
      (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'))};
  }
`;

const SessionTitle = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const DeleteButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.palette.text.secondary};
  cursor: pointer;
  opacity: 0.7;
  
  &:hover {
    opacity: 1;
    color: ${props => props.theme.palette.error.main};
  }
`;

const ChatPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ChatHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ChatTitle = styled.h2`
  margin: 0;
  font-size: 1.2rem;
  color: ${props => props.theme.palette.text.primary};
`;

const MessagesContainer = styled.div`
  padding: 16px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: ${props => props.theme.palette.background.default};
`;

const MessageBubble = styled.div<{ isUser?: boolean }>`
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
  align-self: ${props => (props.isUser ? 'flex-end' : 'flex-start')};
  background-color: ${props => (props.isUser ? 
    props.theme.palette.primary.main : 
    (props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'))};
  color: ${props => (props.isUser ? 
    props.theme.palette.primary.contrastText : 
    props.theme.palette.text.primary)};
  word-break: break-word;
`;

const MessageTime = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.palette.text.secondary};
  margin-top: 4px;
  text-align: right;
`;

const InputContainer = styled.div`
  padding: 16px;
  border-top: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props => 
    props.theme.palette.mode === 'dark' ? 
    'rgba(255, 255, 255, 0.05)' : 
    'rgba(0, 0, 0, 0.02)'};
`;

const InputForm = styled.form`
  display: flex;
  gap: 8px;
`;

const TextInput = styled.textarea`
  flex: 1;
  padding: 12px;
  border: 1px solid ${props => props.theme.palette.divider};
  border-radius: 4px;
  resize: none;
  font-family: inherit;
  min-height: 48px;
  max-height: 200px;
  background-color: ${props => props.theme.palette.background.paper};
  color: ${props => props.theme.palette.text.primary};
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.palette.primary.main};
  }
  
  &::placeholder {
    color: ${props => props.theme.palette.text.secondary};
  }
`;

const SendButton = styled.button`
  padding: 0 16px;
  background-color: ${props => props.theme.palette.primary.main};
  color: ${props => props.theme.palette.primary.contrastText};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background-color: ${props => props.theme.palette.primary.dark};
  }
  
  &:disabled {
    background-color: ${props => 
      props.theme.palette.mode === 'dark' ? 
      'rgba(255, 255, 255, 0.12)' : 
      'rgba(0, 0, 0, 0.12)'};
    color: ${props => 
      props.theme.palette.mode === 'dark' ? 
      'rgba(255, 255, 255, 0.3)' : 
      'rgba(0, 0, 0, 0.26)'};
    cursor: not-allowed;
  }
`;

const LoadingIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: ${props => props.theme.palette.text.secondary};
`;

const EmptyStateContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.palette.text.secondary};
  text-align: center;
  padding: 32px;
`;

const EmptyStateHeading = styled.h3`
  margin-bottom: 8px;
  color: ${props => props.theme.palette.text.primary};
`;

const EmptyStateText = styled.p`
  max-width: 400px;
  color: ${props => props.theme.palette.text.secondary};
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

export const StyledChat: React.FC<ChatProps> = ({
  sessions,
  activeSessionId,
  isLoading,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onSendMessage,
}) => {
  const { t } = useTranslation('agent');
  const [inputValue, setInputValue] = useState<string>('');
  const messagesEndReference = useRef<HTMLDivElement>(null);
  const inputReference = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find(session => session.id === activeSessionId);

  // 自动滚动到消息底部
  useEffect(() => {
    if (messagesEndReference.current) {
      messagesEndReference.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.conversations]);

  // 处理消息提交
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    onSendMessage(inputValue);
    setInputValue('');
  };

  // 处理按键事件（Ctrl+Enter提交）
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // 调整输入框高度
  const adjustTextareaHeight = () => {
    if (inputReference.current) {
      inputReference.current.style.height = 'auto';
      inputReference.current.style.height = `${inputReference.current.scrollHeight}px`;
    }
  };

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

  const formatTime = (date?: Date) => {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ChatContainer>
      <SessionsContainer>
        <SessionsHeader>
          <NewSessionBtn onClick={onNewSession}>{t('Chat.NewSession', { ns: 'agent' })}</NewSessionBtn>
        </SessionsHeader>
        <SessionList>
          {groupSessions().map((group) => (
            <SessionGroup key={group.heading}>
              <SessionGroupHeading>{group.heading}</SessionGroupHeading>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  active={session.id === activeSessionId}
                  onClick={() => {
                    onSelectSession(session.id);
                  }}
                >
                  <SessionTitle>{session.title || `${t('Chat.Session', { ns: 'agent' })} ${session.id}`}</SessionTitle>
                  <DeleteButton
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                  >
                    ✕
                  </DeleteButton>
                </SessionItem>
              ))}
            </SessionGroup>
          ))}
        </SessionList>
      </SessionsContainer>

      <ChatPanel>
        {activeSession
          ? (
            <>
              <ChatHeader>
                <ChatTitle>{activeSession.title || `${t('Chat.Session', { ns: 'agent' })} ${activeSession.id}`}</ChatTitle>
              </ChatHeader>

              <MessagesContainer>
                {activeSession.conversations.map((conversation) => (
                  <React.Fragment key={conversation.id}>
                    <MessageBubble isUser>
                      {conversation.question}
                      <MessageTime>{formatTime(conversation.createdAt)}</MessageTime>
                    </MessageBubble>
                    {conversation.response && (
                      <MessageBubble>
                        {conversation.response}
                        <MessageTime>{formatTime(conversation.updatedAt)}</MessageTime>
                      </MessageBubble>
                    )}
                  </React.Fragment>
                ))}
                {isLoading && (
                  <LoadingIndicator>
                    {t('Chat.Thinking', { ns: 'agent' })}
                  </LoadingIndicator>
                )}
                <div ref={messagesEndReference} />
              </MessagesContainer>

              <InputContainer>
                <InputForm onSubmit={handleSubmit}>
                  <TextInput
                    ref={inputReference}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      adjustTextareaHeight();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={t('Chat.InputPlaceholder', { ns: 'agent' })}
                    disabled={isLoading}
                    rows={1}
                  />
                  <SendButton type='submit' disabled={isLoading || !inputValue.trim()}>
                    {t('Chat.Send', { ns: 'agent' })}
                  </SendButton>
                </InputForm>
              </InputContainer>
            </>
          )
          : (
            <EmptyStateContainer>
              <EmptyStateHeading>{t('Chat.StartNewConversation', { ns: 'agent' })}</EmptyStateHeading>
              <EmptyStateText>
                {t('Chat.EmptyStateDescription', { ns: 'agent' })}
              </EmptyStateText>
            </EmptyStateContainer>
          )}
      </ChatPanel>
    </ChatContainer>
  );
};
