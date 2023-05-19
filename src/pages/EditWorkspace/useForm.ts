import { IWorkspace } from '@services/workspaces/interface';
import usePreviousValue from 'beautiful-react-hooks/usePreviousValue';
import { useCallback, useEffect, useState } from 'react';

export function useForm(
  originalWorkspace?: IWorkspace,
): [IWorkspace | undefined, React.Dispatch<React.SetStateAction<IWorkspace | undefined>>, () => Promise<void>] {
  const [workspace, workspaceSetter] = useState(originalWorkspace);
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
  }, [workspace]);
  return [workspace, workspaceSetter, onSave];
}
