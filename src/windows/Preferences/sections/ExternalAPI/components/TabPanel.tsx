import { Box } from '@mui/material';
import React from 'react';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

export function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div
      role='tabpanel'
      hidden={value !== index}
      id={`provider-tabpanel-${index}`}
      aria-labelledby={`provider-tab-${index}`}
      style={{ width: '100%', padding: '16px' }}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export function a11yProps(index: number) {
  return {
    id: `provider-tab-${index}`,
    'aria-controls': `provider-tabpanel-${index}`,
  };
}
