import { Route, Switch } from 'wouter';

import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import React from 'react';
import { AgentsManage } from './AgentsManage';

export default function Workflow(): React.JSX.Element {
  return (
    <Switch>
      {/* ChatGPT style page, with session list on the left. Given a sessionID, we will set that session on focus an open chat on the right. */}
      <Route path={`/${WindowNames.main}/${PageType.agent}/session/:sessionID*`} component={AgentSessions} />
      {/* By default, the non-focused session list or empty session list will be displayed. User can start chat on the right, and will auto create a new session. */}
      <Route path={`/${WindowNames.main}/${PageType.agent}/`} component={AgentSessions} />
      {/* User can pick from available agents here, to create an agent-based-session. */}
      <Route path={`/${WindowNames.main}/${PageType.agent}/agents`} component={AgentsManage} />
    </Switch>
  );
}
