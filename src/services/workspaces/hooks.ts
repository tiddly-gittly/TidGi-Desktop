import useObservable from 'beautiful-react-hooks/useObservable';
import { useMemo, useState } from 'react';
import { map } from 'rxjs/operators';
import { IWorkspace, IWorkspaceWithMetadata } from './interface';
import { workspaceSorter } from './utils';

export function useWorkspacesListObservable(): IWorkspaceWithMetadata[] | undefined {
  const [workspaces, workspacesSetter] = useState<IWorkspaceWithMetadata[] | undefined>();
  // beware not pipe directly in the react hock, as it will re-pipe every time React reRenders, and every time regarded as new Observable, so it will re-subscribe
  // useMemo will solve this
  const workspacesList$ = useMemo(
    () =>
      window.observables.workspace.workspaces$.pipe(
        map<Record<string, IWorkspaceWithMetadata>, IWorkspaceWithMetadata[]>((workspaces) => Object.values(workspaces).sort(workspaceSorter)),
      ),
    [],
  );
  useObservable(workspacesList$, workspacesSetter as any);
  return workspaces;
}

export function useWorkspaceObservable(id: string): IWorkspace | undefined {
  const [workspace, workspaceSetter] = useState<IWorkspace | undefined>();
  const workspace$ = useMemo(() => window.observables.workspace.get$(id), [id]);
  useObservable(workspace$, workspaceSetter as any);
  return workspace;
}
