import React from 'react';

import { TabStoreInitializer } from './components/TabStoreInitializer';
import { AgentLayout } from './components/UI/AgentLayout';
import { TabContentArea } from './TabContent/TabContentArea';

export default function Agent(): React.JSX.Element {
  return (
    <>
      <TabStoreInitializer />
      <AgentLayout>
        <TabContentArea />
      </AgentLayout>
    </>
  );
}
