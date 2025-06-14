import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';

interface AgentLayoutProps {
  children: React.ReactNode;
}

const LayoutContainer = styled(Box)`
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: ${props => props.theme.palette.background.default};
`;

export const AgentLayout: React.FC<AgentLayoutProps> = ({ children }) => {
  return <LayoutContainer>{children}</LayoutContainer>;
};
