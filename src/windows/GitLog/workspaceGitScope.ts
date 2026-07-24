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
    // Normalize to forward slashes for cross-platform consistency with the main-process scope.
    directory: filePath.slice(0, lastSeparatorIndex).replace(/\\/g, '/'),
    baseName: filePath.slice(lastSeparatorIndex + 1),
  };
}

/**
 * Resolve a relative path (containing only "." and ".." segments) against an absolute base path,
 * without importing node:path. Normalizes separators to "/".
 */
function resolveRelativePath(basePath: string, relativePath: string): string {
  const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const isWindowsAbsolute = /^[A-Za-z]:/.test(normalizedBase);
  const segments = normalizedBase.split('/').filter((segment) => segment.length > 0);
  // The drive-letter segment (e.g. "C:") is the root anchor on Windows; ".." must not pop past it.
  // On POSIX there is no anchor segment, so clamp at length 0.
  const minSegments = isWindowsAbsolute && segments.length > 0 ? 1 : 0;
  const relativeSegments = relativePath.replace(/\\/g, '/').split('/').filter((segment) => segment.length > 0 && segment !== '.');
  for (const segment of relativeSegments) {
    if (segment === '..') {
      if (segments.length > minSegments) segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return (isWindowsAbsolute ? '' : '/') + segments.join('/');
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
  const configuredRepoPath = workspace.gitRepoPath;
  if (typeof configuredRepoPath === 'string' && configuredRepoPath.trim() !== '' && configuredRepoPath.trim() !== '.') {
    const repoRoot = resolveRelativePath(workspace.wikiFolderLocation, configuredRepoPath);
    const scopedPath = typeof workspace.gitManagedRelativePath === 'string' && workspace.gitManagedRelativePath.trim() !== ''
      ? workspace.gitManagedRelativePath
      : baseName;
    return {
      repoPath: repoRoot,
      scopedPath,
      managedDisplayName: baseName,
      managedAbsolutePath: workspace.wikiFolderLocation,
      isSingleFileScope: false,
    };
  }
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

/**
 * Split an absolute path into its portable segments (handles both "/" and "\\"), dropping drive
 * letter on Windows so segment counts are comparable. Returns empty array for root paths.
 */
function splitPathSegments(filePath: string): string[] {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter((segment) => segment.length > 0 && !/^[A-Za-z]:$/.test(segment));
}

/**
 * Compute the `gitRepoPath` (relative path from `wikiFolderLocation` up to `ancestorRepoRoot`) and
 * `gitManagedRelativePath` (wiki folder path relative to the repo root) for storing in workspace
 * config. `ancestorRepoRoot` must be an ancestor directory of `wikiFolderLocation`.
 *
 * Returns `{ gitRepoPath, gitManagedRelativePath }` where gitRepoPath uses "../" segments (or "." if
 * the wiki folder itself is the repo root). Renderer-safe (no node:path import).
 */
export function computeGitScopePaths(wikiFolderLocation: string, ancestorRepoRoot: string): { gitRepoPath: string; gitManagedRelativePath: string } {
  const wikiSegs = splitPathSegments(wikiFolderLocation);
  const repoSegs = splitPathSegments(ancestorRepoRoot);
  const depthDiff = Math.max(0, wikiSegs.length - repoSegs.length);
  const gitRepoPath = depthDiff === 0 ? '.' : Array(depthDiff).fill('..').join('/');
  const managedRelativePath = wikiSegs.slice(repoSegs.length).join('/');
  return { gitRepoPath, gitManagedRelativePath: managedRelativePath };
}

export type { IWorkspaceGitScope };
