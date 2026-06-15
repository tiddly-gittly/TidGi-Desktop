import { dialog } from 'electron';
import { injectable } from 'inversify';

import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { ISyncService } from '@services/sync/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IHtmlWikiWorkspace } from '@services/workspaces/interface';
import { isHtmlWikiWorkspace } from '@services/workspaces/workspacePaths';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

import { readHtmlWikiFile, validateHtmlWikiFile, writeHtmlWikiFile } from './htmlFileIO';
import { HtmlWikiHttpServerManager } from './httpServer';
import type { IHtmlWikiService } from './interface';

@injectable()
export class HtmlWiki implements IHtmlWikiService {
  private readonly httpServerManager = new HtmlWikiHttpServerManager();
  private readonly activeWorkspaceIds = new Set<string>();

  public async checkHtmlWikiExist(workspace: IHtmlWikiWorkspace, options: { showDialog?: boolean } = {}): Promise<string | true> {
    const { htmlFileLocation, id: workspaceID, name } = workspace;
    try {
      await validateHtmlWikiFile(htmlFileLocation);
      return true;
    } catch (error) {
      const checkResult = (error as Error).message;
      const errorMessage = `${i18n.t('Dialog.CantFindWorkspaceFolderRemoveWorkspace')} ${htmlFileLocation} ${checkResult}`;
      logger.error(errorMessage);
      const windowService = container.get<IWindowService>(serviceIdentifier.Window);
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow !== undefined && options.showDialog === true) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          title: i18n.t('Dialog.WorkspaceFolderRemoved'),
          message: errorMessage,
          buttons: [i18n.t('Dialog.RemoveWorkspace'), i18n.t('Dialog.DoNotCare')],
          cancelId: 1,
          defaultId: 0,
        });
        if (response === 0) {
          const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
          const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
          await workspaceViewService.removeWorkspaceView(workspaceID);
          await workspaceService.remove(workspaceID);
        }
      }
      return errorMessage;
    }
  }

  public async startWorkspace(workspace: IHtmlWikiWorkspace): Promise<void> {
    await validateHtmlWikiFile(workspace.htmlFileLocation);
    this.activeWorkspaceIds.add(workspace.id);
    if (workspace.enableHTTPAPI) {
      await this.httpServerManager.start(workspace, this);
    }
    const syncService = container.get<ISyncService>(serviceIdentifier.Sync);
    await syncService.startIntervalSyncIfNeeded(workspace);
    logger.info('[test-id-HTML_WIKI_STARTED] HTML wiki workspace started', {
      workspaceId: workspace.id,
      htmlFileLocation: workspace.htmlFileLocation,
    });
  }

  public async stopWorkspace(workspaceID: string): Promise<void> {
    await this.httpServerManager.stop(workspaceID);
    this.activeWorkspaceIds.delete(workspaceID);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.get(workspaceID);
    if (workspace && isHtmlWikiWorkspace(workspace)) {
      const syncService = container.get<ISyncService>(serviceIdentifier.Sync);
      syncService.stopIntervalSync(workspaceID);
    }
    logger.info('HTML wiki workspace stopped', { workspaceId: workspaceID });
  }

  public async restartWorkspace(workspace: IHtmlWikiWorkspace): Promise<void> {
    await this.stopWorkspace(workspace.id);
    await this.startWorkspace(workspace);
  }

  public async readHtmlFile(htmlFileLocation: string): Promise<string> {
    return readHtmlWikiFile(htmlFileLocation);
  }

  public async writeHtmlFile(htmlFileLocation: string, content: string): Promise<void> {
    await writeHtmlWikiFile(htmlFileLocation, content);
  }

  public async validateHtmlFile(htmlFileLocation: string): Promise<void> {
    await validateHtmlWikiFile(htmlFileLocation);
  }

  public async getIndexResponse(workspaceID: string): Promise<import('@services/wiki/wikiWorker/ipcServerRoutes').IWikiServerRouteResponse> {
    const workspace = await this.getHtmlWorkspaceOrThrow(workspaceID);
    const html = await readHtmlWikiFile(workspace.htmlFileLocation);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      data: html,
    };
  }

  public async saveHtmlResponse(workspaceID: string, htmlContent: string): Promise<import('@services/wiki/wikiWorker/ipcServerRoutes').IWikiServerRouteResponse> {
    const workspace = await this.getHtmlWorkspaceOrThrow(workspaceID);
    if (workspace.readOnlyMode) {
      return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, data: 'Read-only mode' };
    }
    await writeHtmlWikiFile(workspace.htmlFileLocation, htmlContent);
    const gitService = container.get<import('@services/git/interface').IGitService>(serviceIdentifier.Git);
    gitService.notifyFileChange(workspace.wikiFolderLocation, { onlyWhenGitLogOpened: true });
    return { statusCode: 204, headers: {} as Record<string, string>, data: '' };
  }

  public async getStatusResponse(workspaceID: string, userName: string): Promise<import('@services/wiki/wikiWorker/ipcServerRoutes').IWikiServerRouteResponse> {
    const workspace = await this.getHtmlWorkspaceOrThrow(workspaceID);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      data: {
        anonymous: false,
        read_only: workspace.readOnlyMode ?? false,
        space: { recipe: 'default' },
        tiddlywiki_version: 'HTML',
        username: userName,
      },
    };
  }

  public async handleHttpRequest(workspaceID: string, method: string, body?: string) {
    const workspace = await this.getHtmlWorkspaceOrThrow(workspaceID);
    if (method === 'GET' || method === 'HEAD') {
      const html = await readHtmlWikiFile(workspace.htmlFileLocation);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: html,
      };
    }
    if (method === 'PUT' || method === 'POST') {
      if (workspace.readOnlyMode) {
        return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Read-only mode' };
      }
      if (typeof body !== 'string' || body.length === 0) {
        return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Empty body' };
      }
      await writeHtmlWikiFile(workspace.htmlFileLocation, body);
      const gitService = container.get<import('@services/git/interface').IGitService>(serviceIdentifier.Git);
      gitService.notifyFileChange(workspace.wikiFolderLocation, { onlyWhenGitLogOpened: true });
      return { statusCode: 204, headers: {} as Record<string, string>, body: '' };
    }
    return { statusCode: 405, headers: { 'Content-Type': 'text/plain' }, body: 'Method not allowed' };
  }

  private async getHtmlWorkspaceOrThrow(workspaceID: string): Promise<IHtmlWikiWorkspace> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.get(workspaceID);
    if (!workspace || !isHtmlWikiWorkspace(workspace)) {
      throw new Error(`HTML wiki workspace not found: ${workspaceID}`);
    }
    return workspace;
  }
}
