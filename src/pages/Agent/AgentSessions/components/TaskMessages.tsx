import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

const MessagesContainer = styled.div`
  padding: 16px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: ${props => props.theme.palette.background.default};
`;

interface TaskMessagesProps {
  children: React.ReactNode;
}

export const TaskMessages: React.FC<TaskMessagesProps> = ({ children }) => {
  const messagesEndReference = useRef<HTMLDivElement>(null);

  // 自动滚动到消息底部
  useEffect(() => {
    if (messagesEndReference.current) {
      messagesEndReference.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [children]);

  return (
    <MessagesContainer>
      {children}
      <div ref={messagesEndReference} />
    </MessagesContainer>
  );
};
