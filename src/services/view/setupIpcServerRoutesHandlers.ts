import { WebContentsView } from 'electron';

import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';

export function setupIpcServerRoutesHandlers(view: WebContentsView, workspaceID: string) {
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const methods = [
    {
      method: 'GET',
      path: /^\/?$/,
      name: 'getIndex',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) => {
        const workspace = await workspaceService.get(workspaceIDFromHost);
        const rootTiddler = workspace && isWikiWorkspace(workspace) ? workspace.rootTiddler : undefined;
        const response = await wikiService.callWikiIpcServerRoute(
          workspaceIDFromHost,
          'getIndex',
          rootTiddler ?? '$:/core/save/lazy-images',
        );
        return response;
      },
    },
    {
      method: 'GET',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'getTiddler',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getTiddler', parameters?.[1] ?? ''),
    },
    {
      method: 'GET',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'getTiddlersJSON',
      handler: async (request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(
          workspaceIDFromHost,
          'getTiddlersJSON',
          new URL(request.url).searchParams.get('filter') ?? '',
          // Allow send empty string to disable omit. Otherwise text field will be omitted.
          new URL(request.url).searchParams.get('exclude')?.split(' ') ?? undefined,
        ),
    },
    {
      method: 'PUT',
      path: /^\/recipes\/default\/tiddlers\/(.+)$/,
      name: 'putTiddler',
      handler: async (request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) => {
        const body = await request.json() as ITiddlerFields;
        await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'putTiddler', parameters?.[1] ?? '', body);
      },
    },
    {
      method: 'DELETE',
      path: /^\/bags\/default\/tiddlers\/(.+)$/,
      name: 'deleteTiddler',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'deleteTiddler', parameters?.[1] ?? ''),
    },
    {
      method: 'GET',
      path: /^\/favicon.ico$/,
      name: 'getFavicon',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, _parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getFavicon'),
    },
    {
      method: 'GET',
      path: /^\/files\/(.+)$/,
      name: 'getFile',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) => {
        /**
         * ```
         * parameters [
            '/files/%E4%B8%9C%E5%90%B413%E5%B2%81%E7%99%BB%E9%95%BF%E5%9F%8E%E7%85%A7.JPG',
            '%E4%B8%9C%E5%90%B413%E5%B2%81%E7%99%BB%E9%95%BF%E5%9F%8E%E7%85%A7.JPG',
            index: 0,
            input: '/files/%E4%B8%9C%E5%90%B413%E5%B2%81%E7%99%BB%E9%95%BF%E5%9F%8E%E7%85%A7.JPG',
            groups: undefined
          ]
          ```

          Decode Chinese similar to src/services/view/setupViewFileProtocol.ts
         */
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
        await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getStatus', userName);
      },
    },
    {
      method: 'GET',
      path: /^\/([^/]+)$/,
      name: 'getTiddlerHtml',
      handler: async (_request: GlobalRequest, workspaceIDFromHost: string, parameters: RegExpMatchArray | null) =>
        await wikiService.callWikiIpcServerRoute(workspaceIDFromHost, 'getTiddlerHtml', parameters?.[1] ?? ''),
    },
  ];
  async function handlerCallback(request: GlobalRequest): Promise<GlobalResponse> {
    const parsedUrl = new URL(request.url);
    // parsedUrl.host is the actual workspaceID, sometimes we get workspaceID1 here, but in the handler callback we found `workspaceID` from the `setupIpcServerRoutesHandlers` param is workspaceID2, seems `view.webContents.session.protocol.handle` will mistakenly handle request from other views.
    const workspaceIDFromHost = parsedUrl.host;
    // When using `standard: true` in `registerSchemesAsPrivileged`, workspaceIDFromHost is lower cased, and cause this
    if (workspaceIDFromHost !== workspaceID.toLowerCase()) {
      logger.warn('workspaceID mismatch in setupIpcServerRoutesHandlers.handlerCallback', {
        function: 'setupIpcServerRoutesHandlers.handlerCallback',
        workspaceIDFromHost,
        workspaceID,
      });
    }
    // Iterate through methods to find matching routes
    try {
      for (const route of methods) {
        if (request.method === route.method && route.path.test(parsedUrl.pathname)) {
          // Get the parameters in the URL path
          const parameters = parsedUrl.pathname.match(route.path);
          logger.debug('setupIpcServerRoutesHandlers.handlerCallback started', {
            function: 'setupIpcServerRoutesHandlers.handlerCallback',
            name: route.name,
            parsedUrl,
            parameters,
          });
          // Call the handler of the route to process the request and return the result
          const responseData = await route.handler(request, workspaceID, parameters);
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
      const error_ = error instanceof Error ? error : new Error(String(error));
      logger.error('setupIpcServerRoutesHandlers.handlerCallback error', {
        function: 'setupIpcServerRoutesHandlers.handlerCallback',
        error: error_.message,
        stack: error_.stack ?? '',
      });
      return new Response(undefined, { status: 500, statusText: `${error_.message} ${error_.stack ?? ''}` });
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
      const error_ = error instanceof Error ? error : new Error(String(error));
      logger.error('setupIpcServerRoutesHandlers.handlerCallback error', {
        function: 'setupIpcServerRoutesHandlers.handlerCallback',
        error: error_.message,
        stack: error_.stack ?? '',
      });
    }
  }
}
