import { BrowserView } from 'electron';

import { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';

export async function setupIpcServerRoutesHandlers(view: BrowserView, workspaceID: string) {
  const urlBase = `tidgi://${workspaceID}`;
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const methods = [
    {
      method: 'DELETE',
      path: /^\/bags\/default\/tiddlers\/(.+)$/,
      name: 'deleteTiddler',
      handler: async (_request: GlobalRequest, parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceID, 'deleteTiddler', parameters?.[1] ?? ''),
    },
    {
      method: 'GET',
      path: /^\/favicon.ico$/,
      name: 'getFavicon',
      handler: async (_request: GlobalRequest, _parameters: RegExpMatchArray | null) => await wikiService.callWikiIpcServerRoute(workspaceID, 'getFavicon'),
    },
    {
      method: 'GET',
      path: /^\/files\/(.+)$/,
      name: 'getFile',
      handler: async (_request: GlobalRequest, parameters: RegExpMatchArray | null) => await wikiService.callWikiIpcServerRoute(workspaceID, 'getFile', parameters?.[1] ?? ''),
    },
    {
      method: 'GET',
      path: /^\/$/,
      name: 'getIndex',
      handler: async (_request: GlobalRequest, _parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceID, 'getIndex', (await workspaceService.get(workspaceID))?.rootTiddler ?? '$:/core/save/lazy-images'),
    },
    {
      method: 'GET',
      path: /^\/status$/,
      name: 'getStatus',
      handler: async (_request: GlobalRequest, _parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceID);
        const userName = workspace === undefined ? '' : await authService.getUserName(workspace);
        await wikiService.callWikiIpcServerRoute(workspaceID, 'getStatus', userName);
      },
    },
    {
      method: 'GET',
      path: /^\/([^/]+)$/,
      name: 'getTiddlerHtml',
      handler: async (_request: GlobalRequest, parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceID, 'getTiddlerHtml', parameters?.[1] ?? ''),
    },
    {
      method: 'GET',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'getTiddler',
      handler: async (_request: GlobalRequest, parameters: RegExpMatchArray | null) => await wikiService.callWikiIpcServerRoute(workspaceID, 'getTiddler', parameters?.[1] ?? ''),
    },
    {
      method: 'GET',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'getTiddlersJSON',
      handler: async (request: GlobalRequest, _parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceID, 'getTiddlersJSON', new URL(request.url).searchParams.get('filter') ?? ''),
    },
    {
      method: 'PUT',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'putTiddler',
      handler: async (request: GlobalRequest, parameters: RegExpMatchArray | null) => {
        const body = await request.json() as ITiddlerFields;
        await wikiService.callWikiIpcServerRoute(workspaceID, 'putTiddler', parameters?.[1] ?? '', body);
      },
    },
  ];
  async function handlerCallback(request: GlobalRequest): Promise<GlobalResponse> {
    const parsedUrl = new URL(request.url);
    // Iterate through methods to find matching routes
    for (const route of methods) {
      if (request.method === route.method && route.path.test(parsedUrl.pathname)) {
        // Get the parameters in the URL path
        const parameters = parsedUrl.pathname.match(route.path);
        logger.debug(`loadHTMLStringForView: ${route.name}`, { parsedUrl, parameters });
        // Call the handler of the route to process the request and return the result
        const responseData = await route.handler(request, parameters);
        if (responseData === undefined) {
          const statusText = `loadHTMLStringForView: responseData is undefined ${request.url}`;
          logger.warn(statusText);
          return new Response(undefined, { status: 404, statusText });
        }
        return new Response(responseData.data, { status: responseData.statusCode, headers: responseData.headers });
      }
    }
    const statusText = `loadHTMLStringForView: tidgi protocol is not handled ${request.url}`;
    logger.warn(statusText);
    return new Response(undefined, { status: 404, statusText });
  }

  try {
    view.webContents.session.protocol.handle(`tidgi`, handlerCallback);
    const handled = view.webContents.session.protocol.isProtocolHandled(`tidgi`);
    if (!handled) {
      logger.warn(`loadHTMLStringForView: tidgi protocol is not handled`);
    }
    logger.info(`view.webContents.loadURL(${urlBase}/)`)
    await view.webContents.loadURL(`${urlBase}/`);
    // view.webContents.session.protocol.unhandle(`tidgi`);
    view.webContents.openDevTools({ mode: 'detach' });
  } catch (error) {
    logger.error(`loadHTMLStringForView: ${(error as Error).message}`);
  }
}
