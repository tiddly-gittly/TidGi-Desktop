import path from 'node:path';

import { isHtmlWiki } from '@/constants/fileNames';
import type { IWikiWorkspace, IWorkspace } from './interface';
import { WorkspaceType } from './workspaceType';

/** Local guard to avoid runtime circular import with interface.ts */
function isWikiWorkspace(workspace: IWorkspace): workspace is IWikiWorkspace {
  return 'wikiFolderLocation' in workspace;
}

export interface IWorkspaceGitScope {
  /** Git repository root directory */
  repoPath: string;
  /** Path relative to repo root for scoped git operations; undefined = whole repo (folder wiki) */
  managedRelativePath?: string;
  /** Absolute path of the file or folder TidGi manages for this workspace */
  managedAbsolutePath: string;
  /** Human-readable label for Git Log file list */
  managedDisplayName: string;
}

export function getWorkspaceType(workspace: IWorkspace): WorkspaceType {
  if (!isWikiWorkspace(workspace)) {
    return WorkspaceType.folder;
  }
  if (workspace.workspaceType === WorkspaceType.html) {
    return WorkspaceType.html;
  }
  return WorkspaceType.folder;
}

export function isHtmlWikiWorkspace(workspace: IWorkspace): workspace is IHtmlWikiWorkspace {
  return isWikiWorkspace(workspace) && getWorkspaceType(workspace) === WorkspaceType.html;
}

export function isFolderWikiWorkspace(workspace: IWorkspace): workspace is IFolderWikiWorkspace {
  return isWikiWorkspace(workspace) && getWorkspaceType(workspace) === WorkspaceType.folder;
}

/** HTML wiki: absolute path to the single .html file */
export interface IHtmlWikiWorkspace extends IWikiWorkspace {
  workspaceType: WorkspaceType.html;
  htmlFileLocation: string;
}

/** Folder wiki (default for legacy workspaces without workspaceType) */
export interface IFolderWikiWorkspace extends IWikiWorkspace {
  workspaceType?: WorkspaceType.folder;
}

export function getHtmlFileLocation(workspace: IWikiWorkspace): string | undefined {
  if (isHtmlWikiWorkspace(workspace)) {
    return workspace.htmlFileLocation;
  }
  return undefined;
}

/**
 * Parent directory used for "open folder", git discovery, and workspace path display for HTML wikis.
 */
export function getWorkspaceContainerPath(workspace: IWikiWorkspace): string {
  if (isHtmlWikiWorkspace(workspace)) {
    return path.dirname(workspace.htmlFileLocation);
  }
  return workspace.wikiFolderLocation;
}

export function getWorkspaceManagedPath(workspace: IWikiWorkspace): string {
  if (isHtmlWikiWorkspace(workspace)) {
    return workspace.htmlFileLocation;
  }
  return workspace.wikiFolderLocation;
}

/**
 * Resolve git scope for a workspace. HTML workspaces limit git to one file inside repo root.
 */
export function getWorkspaceGitScope(workspace: IWorkspace): IWorkspaceGitScope | undefined {
  if (!isWikiWorkspace(workspace)) {
    return undefined;
  }
  if (isHtmlWikiWorkspace(workspace)) {
    const managedAbsolutePath = path.resolve(workspace.htmlFileLocation);
    const repoPath = path.dirname(managedAbsolutePath);
    const managedRelativePath = path.basename(managedAbsolutePath);
    return {
      repoPath,
      managedRelativePath,
      managedAbsolutePath,
      managedDisplayName: managedRelativePath,
    };
  }
  return {
    repoPath: path.resolve(workspace.wikiFolderLocation),
    managedAbsolutePath: path.resolve(workspace.wikiFolderLocation),
    managedDisplayName: path.basename(workspace.wikiFolderLocation),
  };
}

export function normalizeHtmlWorkspacePaths(htmlFileLocation: string): Pick<IHtmlWikiWorkspace, 'htmlFileLocation' | 'wikiFolderLocation'> {
  const resolvedHtml = path.resolve(htmlFileLocation);
  if (!isHtmlWiki(resolvedHtml)) {
    throw new Error(`Not a valid HTML wiki file: ${resolvedHtml}`);
  }
  return {
    htmlFileLocation: resolvedHtml,
    wikiFolderLocation: path.dirname(resolvedHtml),
  };
}
