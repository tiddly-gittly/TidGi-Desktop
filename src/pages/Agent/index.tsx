import React from 'react';

import { VerticalTabBar } from './components/TabBar/VerticalTabBar';
import { TabContentArea } from './components/TabContent/TabContentArea';
import { AgentLayout } from './components/UI/AgentLayout';

export const AgentPage: React.FC = () => {
  return (
    <AgentLayout>
      <VerticalTabBar />
      <TabContentArea />
    </AgentLayout>
  );
};

export default AgentPage;
