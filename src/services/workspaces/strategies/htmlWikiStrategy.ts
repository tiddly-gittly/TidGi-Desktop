import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IHtmlWikiService } from '@services/htmlWiki/interface';
import type { IWikiServerRouteResponse } from '@services/wiki/wikiWorker/ipcServerRoutes';

import { isWikiWorkspace, type IWorkspace } from '../interface';
import {
  getWorkspaceContainerPath,
  getWorkspaceGitScope,
  getWorkspaceManagedPath,
  isHtmlWikiWorkspace,
} from '../workspacePaths';
import type { IWorkspaceStrategy } from './types';

const htmlRuntimeStrategy = {
  kind: 'html' as const,
  usesNodeWikiWorker: false,
  async checkWikiExist(workspace: IWorkspace, options?: { shouldBeMainWiki?: boolean; showDialog?: boolean }) {
    if (!isHtmlWikiWorkspace(workspace)) {
      return 'Not an HTML wiki workspace';
    }
    const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);
    return htmlWikiService.checkHtmlWikiExist(workspace, options);
  },
  async startupWorkspace(workspace: IWorkspace) {
    if (!isHtmlWikiWorkspace(workspace)) return;
    const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);
    await htmlWikiService.startWorkspace(workspace);
  },
  async stopWorkspace(workspaceID: string) {
    const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);
    await htmlWikiService.stopWorkspace(workspaceID);
  },
  async restartWorkspace(workspace: IWorkspace) {
    if (!isHtmlWikiWorkspace(workspace)) return;
    const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);
    await htmlWikiService.restartWorkspace(workspace);
  },
};

const htmlHttpStrategy = {
  async getIndex(workspaceID: string): Promise<IWikiServerRouteResponse> {
    const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);
    return htmlWikiService.getIndexResponse(workspaceID);
  },
  async saveHtml(workspaceID: string, htmlContent: string): Promise<IWikiServerRouteResponse> {
    const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);
    return htmlWikiService.saveHtmlResponse(workspaceID, htmlContent);
  },
  async getStatus(workspaceID: string, userName: string): Promise<IWikiServerRouteResponse> {
    const htmlWikiService = container.get<IHtmlWikiService>(serviceIdentifier.HtmlWiki);
    return htmlWikiService.getStatusResponse(workspaceID, userName);
  },
};

const htmlGitStrategy = {
  getGitScope(workspace: IWorkspace) {
    return getWorkspaceGitScope(workspace);
  },
  getRepoPath(workspace: IWorkspace) {
    const scope = getWorkspaceGitScope(workspace);
    return scope?.repoPath;
  },
};

const htmlMenuStrategy = {
  getOpenFolderLabelKey: 'ContextMenu.OpenHtmlWikiFolder',
  shouldDeleteFolderOnRemove: false,
  canRestartService: true,
  canOpenInBrowser: true,
  canMoveWorkspaceLocation: false,
  getManagedPathForOpen(workspace: IWorkspace) {
    if (!isHtmlWikiWorkspace(workspace)) return undefined;
    return getWorkspaceManagedPath(workspace);
  },
};

export const htmlWikiStrategy: IWorkspaceStrategy = {
  runtime: htmlRuntimeStrategy,
  http: htmlHttpStrategy,
  git: htmlGitStrategy,
  menu: htmlMenuStrategy,
};

export function getHtmlWorkspaceContainerPath(workspace: IWorkspace): string | undefined {
  if (!isWikiWorkspace(workspace)) return undefined;
  return getWorkspaceContainerPath(workspace);
}
