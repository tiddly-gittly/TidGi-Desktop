import usePreviousValue from 'beautiful-react-hooks/usePreviousValue';
import { isEqual, omit } from 'lodash';
import { useCallback, useEffect, useState } from 'react';

import type { IWorkspace } from '@services/workspaces/interface';

export function useForm(
  originalWorkspace?: IWorkspace,
  requestRestartCountDown: () => void = () => {},
): [IWorkspace | undefined, (newValue: IWorkspace, requestSaveAndRestart?: boolean) => void, () => Promise<void>] {
  const [workspace, workspaceSetter] = useState(originalWorkspace);
  const [requestRestartAfterSave, requestRestartAfterSaveSetter] = useState(false);
  const previous = usePreviousValue(originalWorkspace);
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
        if (isEqual(omit(workspace, ['metadata', 'lastNodeJSArgv']), omit(originalWorkspace, ['metadata', 'lastNodeJSArgv']))) {
          workspaceSetter(originalWorkspace);
        }
      }
    }
  }, [originalWorkspace, previous]);

  const onSave = useCallback(async () => {
    if (workspace === undefined) {
      return;
    }
    await window.service.workspace.update(workspace.id, workspace);
    await window.service.native.log('info', '[test-id-WORKSPACE_SAVED]', { workspaceId: workspace.id, workspaceName: workspace.name });
    if (requestRestartAfterSave) {
      requestRestartCountDown();
    }
  }, [workspace, requestRestartAfterSave, requestRestartCountDown]);
  const setterWithRestartOption = (newValue: IWorkspace, requestSaveAndRestart?: boolean) => {
    workspaceSetter(newValue);
    if (requestSaveAndRestart === true && !isEqual(newValue, originalWorkspace)) {
      requestRestartAfterSaveSetter(true);
    }
  };
  return [workspace, setterWithRestartOption, onSave];
}
