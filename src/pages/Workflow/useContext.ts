import { createContext } from 'react';
import { IWorkflowListItem } from './WorkflowManage/WorkflowList';

export interface IWorkflowContext {
  openedWorkflowItem: IWorkflowListItem | undefined;
  setOpenedWorkflowItem: (newItem: IWorkflowListItem | undefined) => void;
}
export const WorkflowContext = createContext<IWorkflowContext>({
  openedWorkflowItem: undefined,
  setOpenedWorkflowItem: () => {},
});
