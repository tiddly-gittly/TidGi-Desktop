import { WebContentsView } from 'electron';

import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IDeepLinkService } from '@services/deepLink/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { getWorkspaceStrategy } from '@services/workspaces/strategies';
import { isHtmlWikiWorkspace } from '@services/workspaces/workspacePaths';
import type { ITiddlerFields } from 'tiddlywiki';

export function setupIpcServerRoutesHandlers(view: WebContentsView, workspaceID: string) {
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const deepLinkService = container.get<IDeepLinkService>(serviceIdentifier.DeepLink);

  async function resolveHttpStrategy(workspaceIDFromHost: string) {
    const workspace = await workspaceService.get(workspaceIDFromHost);
    if (!workspace || !isWikiWorkspace(workspace)) {
      return getWorkspaceStrategy(
        { id: workspaceIDFromHost, name: '', active: false, order: 0, picturePath: null, wikiFolderLocation: '' },
      );
    }
    return getWorkspaceStrategy(workspace);
  }

  const methods = [
    {
      method: 'GET',
      path: /^\/?$/,
      name: 'getIndex',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) => {
        const strategy = await resolveHttpStrategy(workspaceIDFromHost);
        return strategy.http.getIndex(workspaceIDFromHost);
      },
    },
    {
      method: 'PUT',
      path: /^\/?$/,
      name: 'saveHtmlWiki',
      handler: async (request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (!workspace || !isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'Not an HTML wiki workspace' };
        }
        const strategy = getWorkspaceStrategy(workspace);
        if (!strategy.http.saveHtml) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'Save not supported' };
        }
        const htmlContent = await request.text();
        return strategy.http.saveHtml(workspaceIDFromHost, htmlContent);
      },
    },
    {
      method: 'GET',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'getTiddler',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (workspace && isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'Tiddler API not available for HTML wiki' };
        }
        return await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getTiddler', parameters?.[1] ?? '');
      },
    },
    {
      method: 'GET',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'getTiddlersJSON',
      handler: async (request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (workspace && isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'Tiddlers JSON not available for HTML wiki' };
        }
        return await wikiService.callWikiIpcServerRoute(
          workspaceIDFromHost,
          'getTiddlersJSON',
          new URL(request.url).searchParams.get('filter') ?? '',
          new URL(request.url).searchParams.get('exclude')?.split(' ') ?? undefined,
        );
      },
    },
    {
      method: 'PUT',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'putTiddler',
      handler: async (request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (workspace && isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'Tiddler API not available for HTML wiki' };
        }
        const body = await request.json() as ITiddlerFields;
        return await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'putTiddler', parameters?.[1] ?? '', body);
      },
    },
    {
      method: 'DELETE',
      path: /^\/bags\/default\/tiddlers\/(.+)$/,
      name: 'deleteTiddler',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (workspace && isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'Tiddler API not available for HTML wiki' };
        }
        return await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'deleteTiddler', parameters?.[1] ?? '');
      },
    },
    {
      method: 'GET',
      path: /^\/favicon.ico$/,
      name: 'getFavicon',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (workspace && isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: {}, data: '' };
        }
        return await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getFavicon');
      },
    },
    {
      method: 'GET',
      path: /^\/files\/(.+)$/,
      name: 'getFile',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (workspace && isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'External files not available for HTML wiki workspace' };
        }
        return await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getFile', decodeURI(parameters?.[1] ?? ''));
      },
    },
    {
      method: 'GET',
      path: /^\/status$/,
      name: 'getStatus',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        const userName = workspace === undefined ? '' : await authService.getUserName(workspace);
        const strategy = workspace && isWikiWorkspace(workspace) ? getWorkspaceStrategy(workspace) : await resolveHttpStrategy(workspaceIDFromHost);
        return strategy.http.getStatus(workspaceIDFromHost, userName);
      },
    },
    {
      method: 'GET',
      path: /^\/([^/]+)$/,
      name: 'getTiddlerHtml',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        if (workspace && isHtmlWikiWorkspace(workspace)) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, data: 'Tiddler HTML not available for HTML wiki' };
        }
        return await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getTiddlerHtml', parameters?.[1] ?? '');
      },
    },
  ];
  async function handlerCallback(request: GlobalRequest): Promise<GlobalResponse> {
    const parsedUrl = new URL(request.url);
    const workspaceIDFromHost = parsedUrl.host;

    // Handle tidgi://preferences/... deep links at the protocol level.
    // This catches requests that bypass will-navigate (e.g. TiddlyWiki's
    // internal link handling that triggers a direct protocol request).
    if (workspaceIDFromHost === 'preferences') {
      logger.info('setupIpcServerRoutesHandlers: handling preferences deep link via protocol handler', {
        function: 'setupIpcServerRoutesHandlers.handlerCallback',
        url: request.url,
      });
      // Fire the deep link to open the preferences window.
      void deepLinkService.openDeepLink(request.url);
      // Return 204 No Content so the page stays in place without a reload.
      return new Response(undefined, { status: 204 });
    }

    let normalizedPathname = parsedUrl.pathname;
    if ((normalizedPathname === '/' || normalizedPathname === '') && parsedUrl.hash.includes('/files/')) {
      const filesIndex = parsedUrl.hash.lastIndexOf('/files/');
      if (filesIndex >= 0) {
        normalizedPathname = parsedUrl.hash.slice(filesIndex);
      }
    }
    let effectiveWorkspaceID = workspaceID;
    if (workspaceIDFromHost.toLowerCase() !== workspaceID.toLowerCase()) {
      logger.warn('workspaceID mismatch in setupIpcServerRoutesHandlers.handlerCallback, using URL-based ID', {
        function: 'setupIpcServerRoutesHandlers.handlerCallback',
        workspaceIDFromHost,
        workspaceID,
      });
      const workspaceFromHost = await workspaceService.get(workspaceIDFromHost);
      if (workspaceFromHost) {
        effectiveWorkspaceID = workspaceFromHost.id;
      } else {
        const allWorkspaces = await workspaceService.getWorkspacesAsList();
        const matched = allWorkspaces.find(ws => ws.id.toLowerCase() === workspaceIDFromHost.toLowerCase());
        effectiveWorkspaceID = matched?.id ?? workspaceIDFromHost;
      }
    }
    try {
      for (const route of methods) {
        if (request.method === route.method && route.path.test(normalizedPathname)) {
          const parameters = normalizedPathname.match(route.path);
          logger.debug('setupIpcServerRoutesHandlers.handlerCallback started', {
            function: 'setupIpcServerRoutesHandlers.handlerCallback',
            name: route.name,
            parsedUrl,
            normalizedPathname,
            parameters,
          });
          const responseData = await route.handler(request, effectiveWorkspaceID, parameters);
          if (responseData === undefined) {
            const statusText = `setupIpcServerRoutesHandlers.handlerCallback: responseData is undefined ${request.url}`;
            logger.warn(statusText);
            return new Response(undefined, { status: 404, statusText });
          }
          logger.debug('setupIpcServerRoutesHandlers.handlerCallback success', {
            function: 'setupIpcServerRoutesHandlers.handlerCallback',
            name: route.name,
            parsedUrl,
            parameters,
            status: responseData.statusCode,
          });
          return new Response(responseData.data as string, { status: responseData.statusCode, headers: responseData.headers });
        }
      }
    } catch (error) {
      logger.error('setupIpcServerRoutesHandlers.handlerCallback error', {
        function: 'setupIpcServerRoutesHandlers.handlerCallback',
        error,
      });
      return new Response(undefined, { status: 500, statusText: `${(error as Error).message} ${(error as Error).stack ?? ''}` });
    }
    const statusText = `setupIpcServerRoutesHandlers.handlerCallback: tidgi protocol 404 ${request.url}`;
    logger.warn(statusText);
    return new Response(undefined, { status: 404, statusText });
  }

  if (!view.webContents.session.protocol.isProtocolHandled(`tidgi`)) {
    try {
      view.webContents.session.protocol.handle(`tidgi`, handlerCallback);
      const handled = view.webContents.session.protocol.isProtocolHandled(`tidgi`);
      if (!handled) {
        logger.warn('tidgi protocol is not handled', { function: 'setupIpcServerRoutesHandlers.handlerCallback' });
      }
    } catch (error) {
      logger.error('setupIpcServerRoutesHandlers.handlerCallback error', {
        function: 'setupIpcServerRoutesHandlers.handlerCallback',
        error,
      });
    }
  }
}
