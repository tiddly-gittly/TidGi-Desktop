import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useCallback, useContext } from 'react';
import { useLocation } from 'wouter';
import { WorkflowContext } from '../useContext';
import type { IWorkflowListItem } from './WorkflowList';

export function useHandleOpenInTheGraphEditor() {
  const [, setLocation] = useLocation();
  const workflowContext = useContext(WorkflowContext);
  const handleOpenInTheGraphEditor = useCallback((item: IWorkflowListItem) => {
    setLocation(`/${WindowNames.main}/${PageType.workflow}/${item.id}/`);
    workflowContext.setOpenedWorkflowItem(item);
  }, [setLocation, workflowContext]);
  return handleOpenInTheGraphEditor;
}
