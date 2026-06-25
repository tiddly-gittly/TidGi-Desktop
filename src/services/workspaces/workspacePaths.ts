import { isHtmlWiki } from '@/constants/fileNames';
import type { IWikiWorkspace, IWorkspace } from './interface';
import { WorkspaceType } from './workspaceType';

function splitPortablePath(filePath: string): { baseName: string; directory: string; normalized: string } {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const separatorIndex = normalized.lastIndexOf('/');
  return {
    baseName: normalized.slice(separatorIndex + 1),
    directory: separatorIndex <= 0 ? normalized : normalized.slice(0, separatorIndex),
    normalized,
  };
}

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
    return splitPortablePath(workspace.htmlFileLocation).directory;
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
    const { baseName, directory, normalized } = splitPortablePath(workspace.htmlFileLocation);
    return {
      repoPath: directory,
      managedRelativePath: baseName,
      managedAbsolutePath: normalized,
      managedDisplayName: baseName,
    };
  }
  const folderPath = splitPortablePath(workspace.wikiFolderLocation);
  return {
    repoPath: folderPath.normalized,
    managedAbsolutePath: folderPath.normalized,
    managedDisplayName: folderPath.baseName,
  };
}

export function normalizeHtmlWorkspacePaths(htmlFileLocation: string): Pick<IHtmlWikiWorkspace, 'htmlFileLocation' | 'wikiFolderLocation'> {
  const htmlPath = splitPortablePath(htmlFileLocation);
  if (!isHtmlWiki(htmlPath.normalized)) {
    throw new Error(`Not a valid HTML wiki file: ${htmlPath.normalized}`);
  }
  return {
    htmlFileLocation: htmlPath.normalized,
    wikiFolderLocation: htmlPath.directory,
  };
}
