import React from 'react';
import styled from 'styled-components';

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

interface SessionMessagesHeaderProps {
  title: string;
}

export const SessionMessagesHeader: React.FC<SessionMessagesHeaderProps> = ({ title }) => {
  return (
    <Header>
      <Title>{title}</Title>
    </Header>
  );
};
