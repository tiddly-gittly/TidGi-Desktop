import React from 'react';
import styled from 'styled-components';
import { Box } from '@mui/material';

interface AgentLayoutProps {
  children: React.ReactNode;
}

const LayoutContainer = styled(Box)`
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: ${props => props.theme.palette.background.default};
`;

export const AgentLayout: React.FC<AgentLayoutProps> = ({ children }) => {
  return <LayoutContainer>{children}</LayoutContainer>;
};