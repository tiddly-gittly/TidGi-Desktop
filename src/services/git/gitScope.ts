import type { IWorkspaceGitScope } from '@services/workspaces/interface';

export interface IGitScopeOptions {
  /** Limit git operations to this path relative to repo root */
  managedRelativePath?: string;
}

export function appendGitPathSpec(arguments_: string[], scope?: IGitScopeOptions): string[] {
  if (!scope?.managedRelativePath) {
    return arguments_;
  }
  return [...arguments_, '--', scope.managedRelativePath];
}

export function filterFilesByScope<T extends { path: string }>(files: T[], scope?: IGitScopeOptions): T[] {
  if (!scope?.managedRelativePath) {
    return files;
  }
  const managed = scope.managedRelativePath.replace(/\\/g, '/');
  return files.filter((file) => file.path.replace(/\\/g, '/') === managed);
}

export function scopeFromWorkspaceGitScope(gitScope: IWorkspaceGitScope | undefined): IGitScopeOptions | undefined {
  if (!gitScope?.managedRelativePath) {
    return undefined;
  }
  return { managedRelativePath: gitScope.managedRelativePath };
}

export function hasUncommittedChangesInScope(statusOutput: string, scope?: IGitScopeOptions): boolean {
  if (!scope?.managedRelativePath) {
    return statusOutput.trim().length > 0;
  }
  const managed = scope.managedRelativePath.replace(/\\/g, '/');
  return statusOutput
    .split('\n')
    .filter(Boolean)
    .some((line) => {
      const filePath = line.slice(3).trim().replace(/\\/g, '/');
      return filePath === managed || filePath.endsWith(`/${managed}`);
    });
}
