import { Route, Switch } from 'wouter';

import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useState } from 'react';
import { GraphEditor } from './GraphEditor';
import { WorkflowContext } from './GraphEditor/hooks/useContext';
import { RunWorkflow } from './RunWorkflow';
import { runRouteName } from './RunWorkflow/constants';
import { WorkflowManage } from './WorkflowManage';
import { IWorkflowListItem } from './WorkflowManage/WorkflowList';

export default function Workflow(): JSX.Element {
  const [openedWorkflowItem, setOpenedWorkflowItem] = useState<IWorkflowListItem | undefined>();

  return (
    <WorkflowContext.Provider value={{ openedWorkflowItem, setOpenedWorkflowItem }}>
      <Switch>
        <Route path={`/${WindowNames.main}/${PageType.workflow}/workflow/:id/`} component={GraphEditor} />
        <Route path={`/${WindowNames.main}/${PageType.workflow}/${runRouteName}/:workflowID/:runID*`} component={RunWorkflow} />
        <Route path={`/${WindowNames.main}/${PageType.workflow}/`} component={WorkflowManage} />
      </Switch>
    </WorkflowContext.Provider>
  );
}
