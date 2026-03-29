/**
 * Context that provides the current workspace and its setter to custom item/section components.
 * This avoids threading workspace props through every schema-driven item.
 */
import type { IWikiWorkspace } from '@services/workspaces/interface';
import React, { useContext } from 'react';

interface IWorkspaceFormContext {
  workspace: IWikiWorkspace;
  workspaceSetter: (ws: IWikiWorkspace, needsRestart?: boolean) => void;
}

const WorkspaceFormContext = React.createContext<IWorkspaceFormContext | null>(null);

export function WorkspaceFormProvider({
  workspace,
  workspaceSetter,
  children,
}: IWorkspaceFormContext & { children: React.ReactNode }): React.JSX.Element {
  const value = React.useMemo(() => ({ workspace, workspaceSetter }), [workspace, workspaceSetter]);
  return <WorkspaceFormContext.Provider value={value}>{children}</WorkspaceFormContext.Provider>;
}

export function useWorkspaceForm(): IWorkspaceFormContext {
  const context = useContext(WorkspaceFormContext);
  if (context === null) {
    throw new Error('useWorkspaceForm must be used within WorkspaceFormProvider');
  }
  return context;
}
