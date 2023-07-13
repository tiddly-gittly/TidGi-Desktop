import { Route, Switch } from 'wouter';

import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { GraphEditor } from './GraphEditor';
import { WorkflowManage } from './WorkflowManage';

export default function Workflow(): JSX.Element {
  return (
    <Switch>
      <Route path={`/${WindowNames.main}/${PageType.workflow}/:title/`} component={GraphEditor} />
      <Route path={`/${WindowNames.main}/${PageType.workflow}/`} component={WorkflowManage} />
    </Switch>
  );
}
