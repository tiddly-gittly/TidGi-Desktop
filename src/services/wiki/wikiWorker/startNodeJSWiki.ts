// Initialize worker-side service proxies before starting the wiki.
import './services';
import { native, service } from './services';
import { onWorkerServicesReady } from './servicesReady';

import { getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { defaultServerIP } from '@/constants/urls';
import type { TidgiService } from '@/types/tidgi-tw';
import intercept from 'intercept-stdout';
import { nanoid } from 'nanoid';
import type { Server } from 'node:http';
import inspector from 'node:inspector';
import path from 'path';
import { Observable } from 'rxjs';
import { IWikiMessage, WikiControlActions } from '../interface';
import { wikiOperationsInWikiWorker } from '../wikiOperations/executor/wikiOperationInServer';
import type { IStartNodeJSWikiConfigs } from '../wikiWorker';
import { setWikiInstance } from './globals';
import { ipcServerRoutes } from './ipcServerRoutes';
import { authTokenIsProvided, loadTiddlyWikiModule } from './loadTiddlyWikiModule';
import { createLoadWikiTiddlersWithSubWikis } from './loadWikiTiddlersWithSubWikis';

type BootContext = Pick<
  IStartNodeJSWikiConfigs,
  | 'constants'
  | 'enableHTTPAPI'
  | 'authToken'
  | 'excludedPlugins'
  | 'homePath'
  | 'https'
  | 'readOnlyMode'
  | 'rootTiddler'
  | 'useWikiFolderAsTiddlersPath'
  | 'shouldUseDarkColors'
  | 'subWikis'
  | 'tiddlyWikiHost'
  | 'tiddlyWikiPort'
  | 'tokenAuth'
  | 'userName'
  | 'workspace'
>;

async function bootWiki(
  configs: BootContext,
  observer: { next: (value: IWikiMessage) => void },
  fullBootArgv: string[],
): Promise<void> {
  const {
    enableHTTPAPI,
    authToken,
    constants: { TIDDLYWIKI_BUILT_IN_PLUGINS_PATH, TIDDLY_WIKI_BOOT_PATH },
    excludedPlugins = [],
    homePath,
    https,
    readOnlyMode,
    rootTiddler = '$:/core/save/all',
    shouldUseDarkColors,
    useWikiFolderAsTiddlersPath = false,
    subWikis = [],
    tiddlyWikiHost = defaultServerIP,
    tiddlyWikiPort = 5112,
    tokenAuth,
    userName,
    workspace,
  } = configs;

  // Log which TiddlyWiki version is being used (local vs built-in)
  const isUsingLocalTiddlyWiki = TIDDLY_WIKI_BOOT_PATH.includes(path.join(homePath, 'node_modules'));
  void native.logFor(
    workspace.name,
    'info',
    `Starting TiddlyWiki from ${isUsingLocalTiddlyWiki ? 'wiki-local installation' : 'built-in installation'}: ${TIDDLY_WIKI_BOOT_PATH}`,
  );

  const { TiddlyWiki } = await loadTiddlyWikiModule(TIDDLY_WIKI_BOOT_PATH);
  const wikiInstance = TiddlyWiki();
  setWikiInstance(wikiInstance);

  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const pluginPaths = [
    path.resolve(homePath, 'plugins'),
    TIDDLYWIKI_BUILT_IN_PLUGINS_PATH,
  ];
  process.env.TIDDLYWIKI_PLUGIN_PATH = pluginPaths.join(pathSeparator);
  process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');

  if (subWikis.length > 0) {
    wikiInstance.loadWikiTiddlers = createLoadWikiTiddlersWithSubWikis(
      wikiInstance,
      homePath,
      subWikis,
      { allowLoadingWithoutWikiInfo: useWikiFolderAsTiddlersPath },
      workspace.name,
      native,
    );
  }

  wikiInstance.boot.extraPlugins = [
    readOnlyMode === true ? undefined : 'plugins/linonetwo/watch-filesystem-adaptor',
    'plugins/linonetwo/tidgi-ipc-syncadaptor',
    'plugins/linonetwo/tidgi-ipc-syncadaptor-ui',
    enableHTTPAPI ? 'plugins/tiddlywiki/tiddlyweb' : undefined,
  ].filter(Boolean) as string[];

  const readonlyArguments = readOnlyMode === true
    ? ['gzip=yes', 'readers=(anon)', `writers=${userName || nanoid()}`, `username=${userName}`, `password=${nanoid()}`]
    : [];

  const infoTiddlerText = `exports.getInfoTiddlerFields = () => [
    {title: "$:/info/tidgi/readOnlyMode", text: "${readOnlyMode === true ? 'yes' : 'no'}"},
    {title: "$:/info/tidgi/workspaceID", text: ${JSON.stringify(workspace.id)}},
    {title: "$:/info/tidgi/useWikiFolderAsTiddlersPath", text: "${useWikiFolderAsTiddlersPath ? 'yes' : 'no'}"},
  ]`;
  wikiInstance.preloadTiddler({
    title: '$:/core/modules/info/tidgi-server.js',
    text: infoTiddlerText,
    type: 'application/javascript',
    'module-type': 'info',
  });

  let tokenAuthenticateArguments: string[] = [`anon-username=${userName}`];
  if (tokenAuth === true) {
    if (authTokenIsProvided(authToken)) {
      tokenAuthenticateArguments = [`authenticated-user-header=${getTidGiAuthHeaderWithToken(authToken)}`, `readers=${userName}`, `writers=${userName}`];
    } else {
      observer.next({ type: 'control', actions: WikiControlActions.error, message: 'tokenAuth is true, but authToken is empty, this can be a bug.', argv: fullBootArgv });
    }
  }

  const httpsArguments = https?.enabled && https.tlsKey && https.tlsCert
    ? [`tls-key=${https.tlsKey}`, `tls-cert=${https.tlsCert}`]
    : [];

  const excludePluginsArguments = readOnlyMode === true
    ? [
      '--setfield',
      excludedPlugins.map((pluginOrTiddlerTitle) => pluginOrTiddlerTitle.includes('[') && pluginOrTiddlerTitle.includes(']') ? pluginOrTiddlerTitle : `[[${pluginOrTiddlerTitle}]]`)
        .join(' '),
      'text',
      '',
      'text/plain',
    ]
    : [];

  const argv = enableHTTPAPI
    ? [
      homePath,
      '--listen',
      `port=${tiddlyWikiPort}`,
      `host=${tiddlyWikiHost}`,
      `root-tiddler=${rootTiddler}`,
      ...httpsArguments,
      ...readonlyArguments,
      ...tokenAuthenticateArguments,
      ...excludePluginsArguments,
    ]
    : [homePath, '--version'];
  wikiInstance.boot.argv = [...argv];
  fullBootArgv.length = 0;
  fullBootArgv.push(...argv);

  type TidgiContainer = { tidgi?: { service?: TidgiService } };
  const wikiInstanceWithTidgi = wikiInstance as unknown as (typeof wikiInstance & TidgiContainer);
  wikiInstanceWithTidgi.tidgi = wikiInstanceWithTidgi.tidgi ?? {};
  wikiInstanceWithTidgi.tidgi.service = service as unknown as TidgiService;

  wikiInstance.hooks.addHook('th-server-command-post-start', function(_server: unknown, nodeServer: Server) {
    nodeServer.on('error', function(error: Error) {
      observer.next({ type: 'control', actions: WikiControlActions.error, message: error.message, argv: fullBootArgv });
    });
    nodeServer.on('listening', function() {
      observer.next({
        type: 'control',
        actions: WikiControlActions.listening,
        message:
          `Tiddlywiki listening at http://${tiddlyWikiHost}:${tiddlyWikiPort} (webview uri ip may be different, being nativeService.getLocalHostUrlWithActualInfo(appUrl, workspace.id)) with args ${
            fullBootArgv.join(' ')
          }`,
        argv: fullBootArgv,
      });
    });
  });
  wikiInstance.boot.startup({ bootPath: TIDDLY_WIKI_BOOT_PATH });

  ipcServerRoutes.setConfig({ readOnlyMode, shouldUseDarkColors });
  ipcServerRoutes.setHomePath(homePath);
  ipcServerRoutes.setWikiInstance(wikiInstance);
  ipcServerRoutes.setSubWikiPaths(subWikis.map(subWiki => subWiki.wikiFolderLocation));
  wikiOperationsInWikiWorker.setWikiInstance(wikiInstance);
  observer.next({
    type: 'control',
    actions: WikiControlActions.booted,
    message: `Tiddlywiki booted with args ${fullBootArgv.join(' ')}`,
    argv: fullBootArgv,
  });
}

export function startNodeJSWiki(configs: IStartNodeJSWikiConfigs): Observable<IWikiMessage> {
  const { isDev, openDebugger, workspace } = configs;
  const bootContext: BootContext = configs;
  const fullBootArgv: string[] = [];

  return new Observable<IWikiMessage>((observer) => {
    if (openDebugger === true) {
      inspector.open();
      inspector.waitForDebugger();
      // eslint-disable-next-line no-debugger
      debugger;
    }
    // Wait for services to be ready before using intercept with logFor
    onWorkerServicesReady(() => {
      void native.logFor(workspace.name, 'info', 'test-id-WorkerServicesReady', configs as unknown as Record<string, unknown>);
      const textDecoder = new TextDecoder();
      intercept(
        (newStdOut: string | Uint8Array) => {
          const message = typeof newStdOut === 'string' ? newStdOut : textDecoder.decode(newStdOut);
          void native.logFor(workspace.name, 'info', message).catch((error: unknown) => {
            console.error('[intercept] Failed to send stdout to main process:', error, message, JSON.stringify(workspace));
          });
          return message;
        },
        (newStdError: string | Uint8Array) => {
          const message = typeof newStdError === 'string' ? newStdError : textDecoder.decode(newStdError);
          void native.logFor(workspace.name, 'error', message).catch((error: unknown) => {
            console.error('[intercept] Failed to send stderr to main process:', error, message);
          });
          if (
            message.includes('Error executing boot module') ||
            message.includes('Cannot find module')
          ) {
            observer.next({
              type: 'control',
              source: 'plugin-error',
              actions: WikiControlActions.error,
              message,
              argv: [],
            });
          }
          return message;
        },
      );
    });

    // mark isDev as used to satisfy lint when not needed directly
    void isDev;
    observer.next({ type: 'control', actions: WikiControlActions.start, argv: fullBootArgv });

    try {
      bootWiki(bootContext, observer, fullBootArgv).catch((error: unknown) => {
        const message = `Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
        observer.next({ type: 'control', source: 'try catch', actions: WikiControlActions.error, message, argv: fullBootArgv });
      });
    } catch (error: unknown) {
      const message = `Tiddlywiki booted failed synchronously with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      observer.next({ type: 'control', source: 'try catch', actions: WikiControlActions.error, message, argv: fullBootArgv });
    }
  });
}
