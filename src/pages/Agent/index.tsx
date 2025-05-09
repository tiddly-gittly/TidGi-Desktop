import React from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from 'styled-components';

import { VerticalTabBar } from './components/TabBar/VerticalTabBar';
import { TabContentArea } from './components/TabContent/TabContentArea';
import { AgentLayout } from './components/UI/AgentLayout';
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
