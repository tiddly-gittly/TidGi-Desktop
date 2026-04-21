import usePreviousValue from 'beautiful-react-hooks/usePreviousValue';
import { isEqual, omit } from 'lodash';
import { useCallback, useEffect, useState } from 'react';

import { type IWorkspace, nonConfigFields } from '@services/workspaces/interface';

export function useForm(
  originalWorkspace?: IWorkspace,
  requestRestartCountDown: () => void = () => {},
): [IWorkspace | undefined, (newValue: IWorkspace, requestSaveAndRestart?: boolean) => void, () => Promise<void>] {
  const [workspace, workspaceSetter] = useState(originalWorkspace);
  const [requestRestartAfterSave, requestRestartAfterSaveSetter] = useState(false);
  const previous = usePreviousValue(originalWorkspace);

  const hasConfigChanges = useCallback((left?: IWorkspace, right?: IWorkspace): boolean => {
    if (left === undefined || right === undefined) {
      return false;
    }

    return !isEqual(omit(left, nonConfigFields), omit(right, nonConfigFields));
  }, []);

  // initial observable value maybe undefined, we pass an non-null initial value to the form
  useEffect(() => {
    if (previous === undefined && originalWorkspace !== undefined) {
      workspaceSetter(originalWorkspace);
    }
  }, [previous, originalWorkspace]);

  // Sync workspace state with originalWorkspace after save to ensure save button disappears
  useEffect(() => {
    if (originalWorkspace !== undefined && workspace !== undefined && previous !== undefined) {
      // If originalWorkspace changed after a save operation, update workspace state to match it
      // Only check if originalWorkspace changed (not workspace), to avoid triggering on every user edit
      if (!isEqual(originalWorkspace, previous)) {
        // Check if the current form state matches the new originalWorkspace (excluding non-config fields)
        if (!hasConfigChanges(workspace, originalWorkspace)) {
          workspaceSetter(originalWorkspace);
        }
      }
    }
  }, [hasConfigChanges, originalWorkspace, previous, workspace]);

  useEffect(() => {
    if (workspace === undefined || originalWorkspace === undefined) {
      requestRestartAfterSaveSetter(false);
      return;
    }

    if (!hasConfigChanges(workspace, originalWorkspace)) {
      requestRestartAfterSaveSetter(false);
    }
  }, [hasConfigChanges, originalWorkspace, workspace]);

  const onSave = useCallback(async () => {
    if (workspace === undefined) {
      return;
    }
    try {
      await window.service.workspace.update(workspace.id, workspace);
      await window.service.native.log('info', '[test-id-WORKSPACE_SAVED]', { workspaceId: workspace.id, workspaceName: workspace.name });
      if (requestRestartAfterSave) {
        requestRestartCountDown();
      }
    } catch (error) {
      await window.service.native.log('error', 'Failed to save workspace settings', {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        error: (error as Error).message,
      });
      throw error;
    }
  }, [workspace, requestRestartAfterSave, requestRestartCountDown]);
  const setterWithRestartOption = (newValue: IWorkspace, requestSaveAndRestart?: boolean) => {
    workspaceSetter(newValue);
    if (requestSaveAndRestart === true && hasConfigChanges(newValue, originalWorkspace)) {
      requestRestartAfterSaveSetter(true);
    }
  };
  return [workspace, setterWithRestartOption, onSave];
}
