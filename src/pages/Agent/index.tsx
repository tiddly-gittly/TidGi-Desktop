import React from 'react';

import { VerticalTabBar } from './components/TabBar/VerticalTabBar';
import { TabStoreInitializer } from './components/TabStoreInitializer';
import { AgentLayout } from './components/UI/AgentLayout';
import { TabContentArea } from './TabContent/TabContentArea';

export default function Agent(): React.JSX.Element {
  return (
    <>
      <TabStoreInitializer />
      <AgentLayout>
        <VerticalTabBar />
        <TabContentArea />
      </AgentLayout>
    </>
  );
}
