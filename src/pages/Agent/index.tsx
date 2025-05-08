import React from 'react';
import { Box } from '@mui/material';
import { ThemeProvider } from 'styled-components';
import { useTranslation } from 'react-i18next';

import { AgentLayout } from './components/UI/AgentLayout';
import { VerticalTabBar } from './components/TabBar/VerticalTabBar';
import { TabContentArea } from './components/TabContent/TabContentArea';
import { theme } from './theme';

export const AgentPage: React.FC = () => {
  const { t } = useTranslation('agent');
  
  return (
    <ThemeProvider theme={theme}>
      <AgentLayout>
        <VerticalTabBar />
        <TabContentArea />
      </AgentLayout>
    </ThemeProvider>
  );
};

export default AgentPage;