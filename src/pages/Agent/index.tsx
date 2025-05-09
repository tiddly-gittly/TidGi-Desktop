import React from 'react';
import { useTranslation } from 'react-i18next';

import { VerticalTabBar } from './components/TabBar/VerticalTabBar';
import { TabContentArea } from './components/TabContent/TabContentArea';
import { AgentLayout } from './components/UI/AgentLayout';

export const AgentPage: React.FC = () => {
  const { t } = useTranslation('agent');

  return (
    <AgentLayout>
      <VerticalTabBar />
      <TabContentArea />
    </AgentLayout>
  );
};

export default AgentPage;
