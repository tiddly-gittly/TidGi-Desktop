import { useState } from 'react';
import { map } from 'rxjs/operators';
import { useObservable } from 'beautiful-react-hooks';
import { IWorkspace } from './interface';
import { Observable } from 'rxjs';
import { v4 as uuid } from 'uuid';

// beware not pipe in the react hock, as it will re-pipe every time React reRenders, and every time regarded as new Observable, so re-subscribe
const workspacesList$ = window.service.workspace.workspaces$.pipe(
  map<Record<string, IWorkspace>, IWorkspace[]>((workspaces) => Object.values(workspaces)),
);

export function useWorkspacesListObservable(): IWorkspace[] | undefined {
  const [workspaces, workspacesSetter] = useState<IWorkspace[] | undefined>();
  useObservable<IWorkspace[] | undefined>(workspacesList$, workspacesSetter);
  return workspaces;
}

export function useWorkspaceObservable(id: string): IWorkspace | undefined {
  const [workspace, workspaceSetter] = useState<IWorkspace | undefined>();
  useObservable<IWorkspace | undefined>(window.service.workspace.get$(id), workspaceSetter);
  return workspace;
}
