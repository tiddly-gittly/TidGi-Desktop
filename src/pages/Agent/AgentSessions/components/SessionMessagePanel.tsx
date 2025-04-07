import React from 'react';
import styled from 'styled-components';

const Panel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

interface SessionMessagePanelProps {
  children: React.ReactNode;
}

export const SessionMessagePanel: React.FC<SessionMessagePanelProps> = ({ children }) => {
  return <Panel>{children}</Panel>;
};
