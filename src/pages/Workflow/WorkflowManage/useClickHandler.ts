/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { MouseEvent, useCallback, useContext } from 'react';
import { useLocation } from 'wouter';
import { WorkflowContext } from '../GraphEditor/hooks/useContext';
import type { IWorkflowListItem } from './WorkflowList';

export function useHandleOpenInTheGraphEditor(item?: IWorkflowListItem) {
  const [, setLocation] = useLocation();
  const workflowContext = useContext(WorkflowContext);
  const handleOpenInTheGraphEditor = useCallback((item1?: IWorkflowListItem | MouseEvent<HTMLButtonElement>) => {
    const workflowID = item?.id ?? (item1 as IWorkflowListItem)?.id;
    if (!workflowID) return;
    setLocation(`/${WindowNames.main}/${PageType.workflow}/workflow/${workflowID}/`);
    workflowContext.setOpenedWorkflowItem(item);
  }, [setLocation, workflowContext, item]);
  return handleOpenInTheGraphEditor;
}

export function useHandleOpenInTheRunWorkflow(item: IWorkflowListItem) {
  const [, setLocation] = useLocation();
  const workflowContext = useContext(WorkflowContext);
  const handleOpenInTheGraphEditor = useCallback(() => {
    setLocation(`/${WindowNames.main}/${PageType.workflow}/run/${item.id}/`);
    workflowContext.setOpenedWorkflowItem(item);
  }, [setLocation, workflowContext, item]);
  return handleOpenInTheGraphEditor;
}
