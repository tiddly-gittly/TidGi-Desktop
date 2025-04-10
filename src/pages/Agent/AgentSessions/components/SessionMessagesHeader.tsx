import React from 'react';
import styled from 'styled-components';
import { AIModelSelector } from './AIModelSelector';

const Header = styled.div`
  padding: 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.2rem;
  color: ${props => props.theme.palette.text.primary};
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

interface SessionMessagesHeaderProps {
  title: string;
  sessionId?: string;
}

export const SessionMessagesHeader: React.FC<SessionMessagesHeaderProps> = ({ title, sessionId }) => {
  return (
    <Header>
      <HeaderContent>
        <Title>{title}</Title>
      </HeaderContent>
      <AIModelSelector sessionId={sessionId} />
    </Header>
  );
};
