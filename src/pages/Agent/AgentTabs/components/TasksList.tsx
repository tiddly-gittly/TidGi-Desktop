import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  width: ${props => props.theme.workflow.run.chatsList.width || 280}px;
  border-right: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.palette.mode === 'dark' ? '#1e1e1e' : '#f0f2f5'};
`;

const List = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
`;

interface SessionsListProps {
  children: React.ReactNode;
}

export const TasksList: React.FC<SessionsListProps> = ({ children }) => {
  // 将第一个子元素作为头部，其余作为列表项
  const header = React.Children.toArray(children)[0];
  const items = React.Children.toArray(children).slice(1);

  return (
    <Container>
      {header}
      <List>
        {items}
      </List>
    </Container>
  );
};
