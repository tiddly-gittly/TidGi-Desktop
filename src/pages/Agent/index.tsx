import { Route, Switch } from 'wouter';

import React from 'react';
import { AgentTabs } from './AgentTabs';
import { AgentsManage } from './AgentsManage';

export default function Agent(): React.JSX.Element {
  return (
    <>
    <AgentTabs />
    <Switch>
      {/* 使用相对路径，因为我们已经在嵌套路由中 */}
      <Route path='/session/:sessionID*' component={AgentTabs} />
      <Route path='/agents' component={AgentsManage} />
      <Route path='/' component={AgentTabs} />
    </Switch>
    </>
  );
}
