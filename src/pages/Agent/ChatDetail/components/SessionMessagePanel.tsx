import React from 'react';
import { styled } from 'styled-components';

const Panel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  background-color: ${props => props.theme.palette.background.default};
  color: ${props => props.theme.palette.text.primary};
`;

export const SessionMessagePanel: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return <Panel>{children}</Panel>;
};