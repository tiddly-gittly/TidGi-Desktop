import type { IWorkspaceGroup } from '@services/workspaceGroup/interface';
import { useEffect, useState } from 'react';

/**
 * Hook to get all workspace groups as an observable
 */
export function useWorkspaceGroupsObservable(): Record<string, IWorkspaceGroup> | undefined {
  const [workspaceGroups, workspaceGroupsSetter] = useState<Record<string, IWorkspaceGroup> | undefined>();

  useEffect(() => {
    const subscription = window.observables.workspaceGroup.groups$.subscribe((groups) => {
      workspaceGroupsSetter(groups);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return workspaceGroups;
}

/**
 * Hook to get all workspace groups as a list observable
 */
export function useWorkspaceGroupsListObservable(): IWorkspaceGroup[] | undefined {
  const groups = useWorkspaceGroupsObservable();
  return groups === undefined ? undefined : Object.values(groups).sort((a, b) => a.order - b.order);
}
