import { BrowserView } from 'electron';

import { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import { IWikiServerRouteResponse } from '@services/wiki/ipcServerRoutes';
import { IWorkspaceService } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';

export async function setupIpcServerRoutesHandlers(view: BrowserView, workspaceID: string) {
  const urlBase = `tidgi://${workspaceID}/`;
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const methods = [
    {
      method: 'DELETE',
      path: /^\/bags\/default\/tiddlers\/(.+)$/,
      handler: async (title: string) => await wikiService.callWikiIpcServerRoute(workspaceID, 'deleteTiddler', title),
    },
    {
      method: 'GET',
      path: /^\/favicon.ico$/,
      handler: async () => await wikiService.callWikiIpcServerRoute(workspaceID, 'getFavicon'),
    },
    {
      method: 'GET',
      path: /^\/files\/(.+)$/,
      handler: async (fileName: string) => await wikiService.callWikiIpcServerRoute(workspaceID, 'getFile', fileName),
    },
    {
      method: 'GET',
      path: /^\/$/,
      handler: async () => await wikiService.callWikiIpcServerRoute(workspaceID, 'getIndex', (await workspaceService.get(workspaceID))?.rootTiddler ?? '$:/core/save/lazy-images'),
    },
    {
      method: 'GET',
      path: /^\/status$/,
      handler: async () => {
        const workspace = await workspaceService.get(workspaceID);
        const userName = workspace === undefined ? '' : await authService.getUserName(workspace);
        await wikiService.callWikiIpcServerRoute(workspaceID, 'getStatus', userName);
      },
    },
    {
      method: 'GET',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      handler: async (title: string) => await wikiService.callWikiIpcServerRoute(workspaceID, 'getTiddler', title),
    },
    {
      method: 'PUT',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      handler: async (title: string, fields: ITiddlerFields) => await wikiService.callWikiIpcServerRoute(workspaceID, 'putTiddler', title, fields),
    },
  ];
  async function handlerCallback(request: GlobalRequest): Promise<GlobalResponse> {
    // Extracting methods and URLs from requests
    const { method, url } = request;
    const urlPath = url.replace(urlBase, '');
    // DEBUG: console urlPath
    console.log(`urlPath`, urlPath);

    // Iterate through methods to find matching routes
    for (const route of methods) {
      if (method === route.method && route.path.test(urlPath)) {
        // Get the parameters in the URL path
        const parameters = url.match(route.path);

        // Call the handler of the route to process the request and return the result
        if (parameters === null) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
          // @ts-ignore Expected 2 arguments, but got 0.
          const responseData: IWikiServerRouteResponse = await route.handler();
          return new Response(responseData.data, { status: responseData.statusCode, headers: responseData.headers });
        } else {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
          // @ts-ignore Expected 2 arguments, but got 0.
          const responseData: IWikiServerRouteResponse = await route.handler(...parameters.slice(1));
          return new Response(responseData.data, { status: responseData.statusCode, headers: responseData.headers });
        }
      }
    }

    // 如果没有找到匹配的路由，返回404错误
    const statusText = `loadHTMLStringForView: tidgi protocol is not handled ${url}`;
    logger.warn(statusText);
    return new Response(undefined, { status: 404, statusText });
  }

  try {
    view.webContents.session.protocol.handle(`tidgi`, handlerCallback);
    const handled = view.webContents.session.protocol.isProtocolHandled(`tidgi`);
    if (!handled) {
      logger.warn(`loadHTMLStringForView: tidgi protocol is not handled`);
    }
    await view.webContents.loadURL(urlBase);
    // view.webContents.session.protocol.unhandle(`tidgi`);
    view.webContents.openDevTools({ mode: 'detach' });
  } catch (error) {
    logger.error(`loadHTMLStringForView: ${(error as Error).message}`);
  }
}
