import { useState } from 'react';
import { useObservable } from 'beautiful-react-hooks';
import { IWorkspace } from './interface';

export function useWorkspacesObservable(): Record<string, IWorkspace> | undefined {
  const [workspaces, workspacesSetter] = useState<Record<string, IWorkspace> | undefined>();
  useObservable<Record<string, IWorkspace> | undefined>(window.service.workspace.workspaces$, workspacesSetter);
  return workspaces;
}

export function useWorkspaceObservable(id: string): IWorkspace | undefined {
  const [workspace, workspaceSetter] = useState<IWorkspace | undefined>();
  useObservable<IWorkspace | undefined>(window.service.workspace.get$(id), workspaceSetter);
  return workspace;
}
