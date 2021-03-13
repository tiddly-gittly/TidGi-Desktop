import { useState } from 'react';
import { map } from 'rxjs/operators';
import { useObservable } from 'beautiful-react-hooks';
import { IWorkspace } from './interface';

export function useWorkspacesListObservable(): IWorkspace[] | undefined {
  const [workspaces, workspacesSetter] = useState<IWorkspace[] | undefined>();
  useObservable<IWorkspace[] | undefined>(
    window.service.workspace.workspaces$.pipe(
      map<Record<string, IWorkspace>, IWorkspace[]>((workspaces) => Object.values(workspaces)),
    ),
    workspacesSetter,
  );
  return workspaces;
}

export function useWorkspaceObservable(id: string): IWorkspace | undefined {
  const [workspace, workspaceSetter] = useState<IWorkspace | undefined>();
  useObservable<IWorkspace | undefined>(window.service.workspace.get$(id), workspaceSetter);
  return workspace;
}
