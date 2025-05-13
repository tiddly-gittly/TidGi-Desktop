import React from 'react';

import { VerticalTabBar } from './components/TabBar/VerticalTabBar';
import { TabContentArea } from './components/TabContent/TabContentArea';
import { TabStoreInitializer } from './components/TabStoreInitializer';
import { AgentLayout } from './components/UI/AgentLayout';

export const AgentPage: React.FC = () => {
  return (
    <>
      <TabStoreInitializer />
      <AgentLayout>
        <VerticalTabBar />
        <TabContentArea />
      </AgentLayout>
    </>
  );
};

export default AgentPage;
