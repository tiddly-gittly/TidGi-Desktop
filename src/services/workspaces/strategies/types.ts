import type { MenuItemConstructorOptions } from 'electron';

import type { IWikiServerRouteResponse } from '@services/wiki/wikiWorker/ipcServerRoutes';
import type { IWorkspace, IWorkspaceGitScope } from '../interface';

export interface IWorkspaceRuntimeStrategy {
  readonly kind: 'folder' | 'html';
  checkWikiExist(workspace: IWorkspace, options?: { shouldBeMainWiki?: boolean; showDialog?: boolean }): Promise<string | true>;
  startupWorkspace(workspace: IWorkspace): Promise<void>;
  stopWorkspace(workspaceID: string): Promise<void>;
  restartWorkspace(workspace: IWorkspace): Promise<void>;
  usesNodeWikiWorker: boolean;
}

export interface IWorkspaceHttpRouteStrategy {
  getIndex(workspaceID: string): Promise<IWikiServerRouteResponse>;
  saveHtml?(workspaceID: string, htmlContent: string): Promise<IWikiServerRouteResponse>;
  getStatus(workspaceID: string, userName: string): Promise<IWikiServerRouteResponse>;
}

export interface IWorkspaceGitStrategy {
  getGitScope(workspace: IWorkspace): IWorkspaceGitScope | undefined;
  getRepoPath(workspace: IWorkspace): string | undefined;
}

export interface IWorkspaceMenuStrategy {
  getOpenFolderLabelKey: string;
  getRemoveDeleteMessageKey?: string;
  shouldDeleteFolderOnRemove: boolean;
  canRestartService: boolean;
  canOpenInBrowser: boolean;
  canMoveWorkspaceLocation: boolean;
  getManagedPathForOpen(workspace: IWorkspace): string | undefined;
  augmentMenuItems?(items: MenuItemConstructorOptions[], workspace: IWorkspace): MenuItemConstructorOptions[];
}

export interface IWorkspaceStrategy {
  runtime: IWorkspaceRuntimeStrategy;
  http: IWorkspaceHttpRouteStrategy;
  git: IWorkspaceGitStrategy;
  menu: IWorkspaceMenuStrategy;
}
