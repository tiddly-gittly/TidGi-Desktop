import { isWikiWorkspace, type IWorkspace, type IWorkspaceGitScope, WorkspaceType } from '@services/workspaces/interface';

export interface IWorkspaceGitLogScope {
  repoPath: string;
  scopedPath?: string;
  managedDisplayName: string;
  managedAbsolutePath: string;
  isSingleFileScope: boolean;
}

/** Renderer-safe path split — must not import node:path (Git Log runs in browser bundle). */
function splitFilePath(filePath: string): { directory: string; baseName: string } {
  const lastSeparatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSeparatorIndex < 0) {
    return { directory: '.', baseName: filePath };
  }
  return {
    directory: filePath.slice(0, lastSeparatorIndex),
    baseName: filePath.slice(lastSeparatorIndex + 1),
  };
}

function isHtmlWikiWorkspace(workspace: IWorkspace): boolean {
  return isWikiWorkspace(workspace) && workspace.workspaceType === WorkspaceType.html;
}

export function getWorkspaceGitLogScope(workspace: IWorkspace): IWorkspaceGitLogScope | undefined {
  if (!isWikiWorkspace(workspace)) {
    return undefined;
  }

  if (isHtmlWikiWorkspace(workspace)) {
    if (!workspace.htmlFileLocation) {
      return undefined;
    }
    const { directory, baseName } = splitFilePath(workspace.htmlFileLocation);
    return {
      repoPath: directory,
      scopedPath: baseName,
      managedDisplayName: baseName,
      managedAbsolutePath: workspace.htmlFileLocation,
      isSingleFileScope: true,
    };
  }

  const { baseName } = splitFilePath(workspace.wikiFolderLocation);
  return {
    repoPath: workspace.wikiFolderLocation,
    managedDisplayName: baseName,
    managedAbsolutePath: workspace.wikiFolderLocation,
    isSingleFileScope: false,
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
