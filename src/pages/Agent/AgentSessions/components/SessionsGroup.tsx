import React from 'react';
import styled from 'styled-components';

const Group = styled.div`
  margin-bottom: 16px;
`;

const GroupHeading = styled.h3`
  padding: 0 16px;
  margin: 8px 0;
  font-size: 0.9rem;
  color: ${props => props.theme.palette.text.secondary};
`;

interface SessionsGroupProps {
  heading: string;
  children: React.ReactNode;
}

export const SessionsGroup: React.FC<SessionsGroupProps> = ({ heading, children }) => {
  return (
    <Group>
      <GroupHeading>{heading}</GroupHeading>
      {children}
    </Group>
  );
};
