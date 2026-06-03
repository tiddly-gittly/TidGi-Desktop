import useObservable from 'beautiful-react-hooks/useObservable';
import { useMemo, useState } from 'react';
import { map } from 'rxjs/operators';
import type { IWorkspace, IWorkspaceGroup, IWorkspacesWithMetadata, IWorkspaceWithMetadata } from './interface';
import { workspaceSorter } from './utilities';

export function useWorkspacesListObservable(): IWorkspaceWithMetadata[] | undefined {
  const [workspaces, workspacesSetter] = useState<IWorkspaceWithMetadata[] | undefined>();
  // beware not pipe directly in the react hock, as it will re-pipe every time React reRenders, and every time regarded as new Observable, so it will re-subscribe
  // useMemo will solve this
  const workspacesList$ = useMemo(
    () =>
      window.observables.workspace.workspaces$.pipe(
        map<IWorkspacesWithMetadata | undefined, IWorkspaceWithMetadata[]>((workspaces) => Object.values(workspaces ?? {}).sort(workspaceSorter)),
      ),
    [],
  );
  useObservable(workspacesList$, workspacesSetter);
  return workspaces;
}

export function useWorkspaceObservable(id: string): IWorkspace | undefined {
  const [workspace, workspaceSetter] = useState<IWorkspace | undefined>();
  const workspace$ = useMemo(() => window.observables.workspace.get$(id), [id]);
  useObservable(workspace$, workspaceSetter);
  return workspace;
}

export function useWorkspaceGroupsObservable(): Record<string, IWorkspaceGroup> | undefined {
  const [groups, groupsSetter] = useState<Record<string, IWorkspaceGroup> | undefined>();
  const groups$ = useMemo(() => window.observables.workspace.groups$, []);
  useObservable(groups$, groupsSetter);
  return groups;
}

export function useWorkspaceGroupsListObservable(): IWorkspaceGroup[] | undefined {
  const [groups, groupsSetter] = useState<IWorkspaceGroup[] | undefined>();
  const groupsList$ = useMemo(
    () =>
      window.observables.workspace.groups$.pipe(
        map<Record<string, IWorkspaceGroup> | undefined, IWorkspaceGroup[]>((groups) => Object.values(groups ?? {}).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
      ),
    [],
  );
  useObservable(groupsList$, groupsSetter);
  return groups;
}
