import { dialog } from 'electron';
import { injectable } from 'inversify';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getTidGiAuthHeaderWithToken } from '@/constants/auth';
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
import { injectHtmlWikiSaverBootstrap } from './injectHtmlWikiSaverBootstrap';
import type { IHtmlWikiHttpRequest, IHtmlWikiService } from './interface';

const HTML_SYNC_INFO_PATH = '/tidgi-html-sync/info';
const HTML_SYNC_FILE_PATH = '/tidgi-html-sync/file';
const HTML_SYNC_REVISION_HEADER = 'X-TidGi-HTML-Revision';

async function getHtmlWikiRevision(htmlFileLocation: string): Promise<string> {
  const stat = await fs.stat(path.resolve(htmlFileLocation));
  return `${Math.trunc(stat.mtimeMs)}-${stat.size}`;
}

function getHeaderValue(headers: IHtmlWikiHttpRequest['headers'], name: string): string | undefined {
  const value = headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getRequestBaseUrl(request: IHtmlWikiHttpRequest, workspace: IHtmlWikiWorkspace): string {
  const host = getHeaderValue(request.headers, 'host') ?? `127.0.0.1:${workspace.port}`;
  return `http://${host}`;
}

@injectable()
export class HtmlWiki implements IHtmlWikiService {
  private readonly httpServerManager = new HtmlWikiHttpServerManager();
  private readonly activeWorkspaceIds = new Set<string>();

  public async checkHtmlWikiExist(workspace: IHtmlWikiWorkspace, options: { showDialog?: boolean } = {}): Promise<string | true> {
    const { htmlFileLocation, id: workspaceID } = workspace;
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
    const html = injectHtmlWikiSaverBootstrap(await readHtmlWikiFile(workspace.htmlFileLocation));
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
    logger.info('[test-id-HTML_WIKI_SAVED] HTML wiki saved', {
      workspaceId: workspaceID,
      htmlFileLocation: workspace.htmlFileLocation,
    });
    return { statusCode: 204, headers: {}, data: '' };
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

  public async handleHttpRequest(
    workspaceID: string,
    request: IHtmlWikiHttpRequest,
  ): Promise<{ statusCode: number; headers: Record<string, string>; body: string | Buffer }> {
    const workspace = await this.getHtmlWorkspaceOrThrow(workspaceID);
    const method = request.method.toUpperCase();
    const url = new URL(request.url ?? '/', getRequestBaseUrl(request, workspace));
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const requiresAuthentication = pathname.startsWith('/tidgi-html-sync') || method === 'PUT' || method === 'POST';
    if (requiresAuthentication && !this.isHttpRequestAuthorized(workspace, request)) {
      return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Forbidden' };
    }

    if (pathname === '/status') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          ok: true,
          read_only: workspace.readOnlyMode ?? false,
          syncType: 'html',
          workspaceId: workspace.id,
        }),
      };
    }

    if (pathname === HTML_SYNC_INFO_PATH) {
      const baseUrl = getRequestBaseUrl(request, workspace);
      const revision = await getHtmlWikiRevision(workspace.htmlFileLocation);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          baseUrl,
          htmlUrl: `${baseUrl}${HTML_SYNC_FILE_PATH}`,
          readOnly: workspace.readOnlyMode ?? false,
          revision,
          syncType: 'html',
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        }),
      };
    }

    if (method === 'GET' || method === 'HEAD') {
      const html = await readHtmlWikiFile(workspace.htmlFileLocation);
      const revision = await getHtmlWikiRevision(workspace.htmlFileLocation);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: `"${revision}"`, [HTML_SYNC_REVISION_HEADER]: revision },
        body: method === 'HEAD' ? '' : html,
      };
    }
    if (method === 'PUT' || method === 'POST') {
      if (workspace.readOnlyMode) {
        return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Read-only mode' };
      }
      if (typeof request.body !== 'string' || request.body.length === 0) {
        return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Empty body' };
      }
      await writeHtmlWikiFile(workspace.htmlFileLocation, request.body);
      const gitService = container.get<import('@services/git/interface').IGitService>(serviceIdentifier.Git);
      gitService.notifyFileChange(workspace.wikiFolderLocation, { onlyWhenGitLogOpened: true });
      const revision = await getHtmlWikiRevision(workspace.htmlFileLocation);
      return { statusCode: 204, headers: { [HTML_SYNC_REVISION_HEADER]: revision }, body: '' };
    }
    return { statusCode: 405, headers: { 'Content-Type': 'text/plain' }, body: 'Method not allowed' };
  }

  private isHttpRequestAuthorized(workspace: IHtmlWikiWorkspace, request: IHtmlWikiHttpRequest): boolean {
    if (!workspace.tokenAuth) {
      return true;
    }
    if (!workspace.authToken) {
      return false;
    }
    const authHeaderName = getTidGiAuthHeaderWithToken(workspace.authToken);
    const authHeaderValue = getHeaderValue(request.headers, authHeaderName);
    if (typeof authHeaderValue !== 'string' || authHeaderValue.length === 0) {
      return false;
    }
    return !workspace.userName || authHeaderValue === workspace.userName;
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
