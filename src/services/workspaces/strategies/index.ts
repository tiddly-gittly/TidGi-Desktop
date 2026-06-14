import { getWorkspaceType, isWikiWorkspace, type IWorkspace, WorkspaceType } from '../interface';
import { folderWikiStrategy } from './folderWikiStrategy';
import { htmlWikiStrategy } from './htmlWikiStrategy';
import type { IWorkspaceStrategy } from './types';

export type { IWorkspaceGitStrategy, IWorkspaceHttpRouteStrategy, IWorkspaceMenuStrategy, IWorkspaceRuntimeStrategy, IWorkspaceStrategy } from './types';
export { folderWikiStrategy } from './folderWikiStrategy';
export { htmlWikiStrategy } from './htmlWikiStrategy';

export function getWorkspaceStrategy(workspace: IWorkspace): IWorkspaceStrategy {
  if (!isWikiWorkspace(workspace)) {
    return folderWikiStrategy;
  }
  return getWorkspaceType(workspace) === WorkspaceType.html ? htmlWikiStrategy : folderWikiStrategy;
}

export function getWorkspaceStrategyByType(workspaceType: WorkspaceType): IWorkspaceStrategy {
  return workspaceType === WorkspaceType.html ? htmlWikiStrategy : folderWikiStrategy;
}
