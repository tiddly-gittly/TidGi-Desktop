import { Route, Switch } from 'wouter';

import React from 'react';
import { AgentSessions } from './AgentSessions';
import { AgentsManage } from './AgentsManage';

export default function Agent(): React.JSX.Element {
  return (
    <Switch>
      {/* 使用相对路径，因为我们已经在嵌套路由中 */}
      <Route path='/session/:sessionID*' component={AgentSessions} />
      <Route path='/agents' component={AgentsManage} />
      <Route path='/' component={AgentSessions} />
    </Switch>
  );
}
