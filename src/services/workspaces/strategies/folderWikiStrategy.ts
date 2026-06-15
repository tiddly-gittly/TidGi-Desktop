import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiServerRouteResponse } from '@services/wiki/wikiWorker/ipcServerRoutes';

import { isWikiWorkspace, type IWorkspace } from '../interface';
import { getWorkspaceGitScope, getWorkspaceManagedPath } from '../workspacePaths';
import type { IWorkspaceStrategy } from './types';

const folderRuntimeStrategy = {
  kind: 'folder' as const,
  usesNodeWikiWorker: true,
  async checkWikiExist(workspace: IWorkspace, options?: { shouldBeMainWiki?: boolean; showDialog?: boolean }) {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    return wikiService.checkWikiExist(workspace, options);
  },
  async startupWorkspace(workspace: IWorkspace) {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    await wikiService.wikiStartup(workspace);
  },
  async stopWorkspace(workspaceID: string) {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    await wikiService.stopWiki(workspaceID);
  },
  async restartWorkspace(workspace: IWorkspace) {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    await wikiService.restartWiki(workspace);
  },
};

const folderHttpStrategy = {
  async getIndex(workspaceID: string): Promise<IWikiServerRouteResponse> {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const workspaceService = container.get<import('../interface').IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.get(workspaceID);
    const rootTiddler = workspace && isWikiWorkspace(workspace) ? workspace.rootTiddler : undefined;
    const response = await wikiService.callWikiIpcServerRoute(workspaceID, 'getIndex', rootTiddler ?? '$:/core/save/lazy-images');
    if (!response) {
      throw new Error(`getIndex returned undefined for workspace ${workspaceID}`);
    }
    return response;
  },
  async getStatus(workspaceID: string, userName: string): Promise<IWikiServerRouteResponse> {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const response = await wikiService.callWikiIpcServerRoute(workspaceID, 'getStatus', userName);
    if (!response) {
      throw new Error(`getStatus returned undefined for workspace ${workspaceID}`);
    }
    return response;
  },
};

const folderGitStrategy = {
  getGitScope(workspace: IWorkspace) {
    return getWorkspaceGitScope(workspace);
  },
  getRepoPath(workspace: IWorkspace) {
    if (!isWikiWorkspace(workspace)) return undefined;
    return workspace.wikiFolderLocation;
  },
};

const folderMenuStrategy = {
  getOpenFolderLabelKey: 'ContextMenu.OpenWikiFolder',
  shouldDeleteFolderOnRemove: true,
  canRestartService: true,
  canOpenInBrowser: true,
  canMoveWorkspaceLocation: true,
  getManagedPathForOpen(workspace: IWorkspace) {
    if (!isWikiWorkspace(workspace)) return undefined;
    return getWorkspaceManagedPath(workspace);
  },
};

export const folderWikiStrategy: IWorkspaceStrategy = {
  runtime: folderRuntimeStrategy,
  http: folderHttpStrategy,
  git: folderGitStrategy,
  menu: folderMenuStrategy,
};
