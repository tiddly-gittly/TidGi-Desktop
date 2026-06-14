import {
  getWorkspaceGitScope,
  isHtmlWikiWorkspace,
  isWikiWorkspace,
  type IWorkspace,
  type IWorkspaceGitScope,
} from '@services/workspaces/interface';

export interface IWorkspaceGitLogScope {
  repoPath: string;
  scopedPath?: string;
  managedDisplayName: string;
  managedAbsolutePath: string;
  isSingleFileScope: boolean;
}

export function getWorkspaceGitLogScope(workspace: IWorkspace): IWorkspaceGitLogScope | undefined {
  if (!isWikiWorkspace(workspace)) {
    return undefined;
  }
  const gitScope = getWorkspaceGitScope(workspace);
  if (!gitScope) {
    return undefined;
  }
  return {
    repoPath: gitScope.repoPath,
    scopedPath: gitScope.managedRelativePath,
    managedDisplayName: gitScope.managedDisplayName,
    managedAbsolutePath: gitScope.managedAbsolutePath,
    isSingleFileScope: isHtmlWikiWorkspace(workspace),
  };
}

export function getGitLogOptionsForWorkspace(workspace: IWorkspace, baseOptions: Record<string, unknown> = {}) {
  const scope = getWorkspaceGitLogScope(workspace);
  if (!scope) {
    return baseOptions;
  }
  return {
    ...baseOptions,
    scopedPath: scope.scopedPath,
  };
}

export type { IWorkspaceGitScope };
