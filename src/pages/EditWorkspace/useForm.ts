import usePreviousValue from 'beautiful-react-hooks/usePreviousValue';
import { isEqual } from 'lodash';
import { useCallback, useEffect, useState } from 'react';

import { IWorkspace } from '@services/workspaces/interface';

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
  const onSave = useCallback(async () => {
    if (workspace === undefined) {
      return;
    }
    await window.service.workspace.update(workspace.id, workspace);
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
