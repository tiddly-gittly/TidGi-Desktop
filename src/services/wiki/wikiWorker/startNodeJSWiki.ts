// Auto-attach services to global.service - MUST import before using services
import './services';
import { native } from './services';
import { onWorkerServicesReady } from './servicesReady';

import { getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { defaultServerIP } from '@/constants/urls';
import { DARK_LIGHT_CHANGE_ACTIONS_TAG } from '@services/theme/interface';
import intercept from 'intercept-stdout';
import { nanoid } from 'nanoid';
import type { Server } from 'node:http';
import inspector from 'node:inspector';
import path from 'path';
import { Observable } from 'rxjs';
import { IWidgetEvent, TiddlyWiki } from 'tiddlywiki';
import { IWikiMessage, WikiControlActions } from '../interface';
import { wikiOperationsInWikiWorker } from '../wikiOperations/executor/wikiOperationInServer';
import type { IStartNodeJSWikiConfigs } from '../wikiWorker';
import { setWikiInstance } from './globals';
import { ipcServerRoutes } from './ipcServerRoutes';
import { createLoadWikiTiddlersWithSubWikis } from './loadWikiTiddlersWithSubWikis';
import { authTokenIsProvided } from './wikiWorkerUtilities';

export function startNodeJSWiki(configs: IStartNodeJSWikiConfigs): Observable<IWikiMessage> {
  const {
    enableHTTPAPI,
    authToken,
    constants: { TIDDLYWIKI_BUILT_IN_PLUGINS_PATH, TIDDLY_WIKI_BOOT_PATH },
    excludedPlugins = [],
    homePath,
    https,
    isDev,
    openDebugger,
    readOnlyMode,
    rootTiddler = '$:/core/save/all',
    shouldUseDarkColors,
    subWikis = [],
    tiddlyWikiHost = defaultServerIP,
    tiddlyWikiPort = 5112,
    tokenAuth,
    userName,
    workspace,
  } = configs;
  return new Observable<IWikiMessage>((observer) => {
    if (openDebugger === true) {
      inspector.open();
      inspector.waitForDebugger();
      // eslint-disable-next-line no-debugger
      debugger;
    }
    // Wait for services to be ready before using intercept with logFor
    onWorkerServicesReady(() => {
      void native.logFor(workspace.name, 'debug', 'test-id-WorkerServicesReady', configs as unknown as Record<string, unknown>);
      const textDecoder = new TextDecoder();
      intercept(
        (newStdOut: string | Uint8Array) => {
          const message = typeof newStdOut === 'string' ? newStdOut : textDecoder.decode(newStdOut);
          // Send to main process logger if services are ready
          void native.logFor(workspace.name, 'info', message).catch((error: unknown) => {
            console.error('[intercept] Failed to send stdout to main process:', error, message, JSON.stringify(workspace));
          });
          return message;
        },
        (newStdError: string | Uint8Array) => {
          const message = typeof newStdError === 'string' ? newStdError : textDecoder.decode(newStdError);
          // Send to main process logger if services are ready
          void native.logFor(workspace.name, 'error', message).catch((error: unknown) => {
            console.error('[intercept] Failed to send stderr to main process:', error, message);
          });

          // Detect critical plugin loading errors that can cause white screen
          // These errors occur during TiddlyWiki boot module execution
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
    let fullBootArgv: string[] = [];
    // mark isDev as used to satisfy lint when not needed directly
    void isDev;
    observer.next({ type: 'control', actions: WikiControlActions.start, argv: fullBootArgv });

    try {
      // Log which TiddlyWiki version is being used (local vs built-in)
      const isUsingLocalTiddlyWiki = TIDDLY_WIKI_BOOT_PATH.includes(path.join(homePath, 'node_modules'));
      void native.logFor(
        workspace.name,
        'info',
        `Starting TiddlyWiki from ${isUsingLocalTiddlyWiki ? 'wiki-local installation' : 'built-in installation'}: ${TIDDLY_WIKI_BOOT_PATH}`,
      );

      const wikiInstance = TiddlyWiki();
      setWikiInstance(wikiInstance);
      /**
       * Set plugin search paths. When wiki uses local TiddlyWiki installation,
       * we still need to include TidGi's built-in plugins path so our custom plugins can be found.
       * Path separator is ':' on Unix and ';' on Windows.
       */
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      const pluginPaths = [
        path.resolve(homePath, 'plugins'),
        TIDDLYWIKI_BUILT_IN_PLUGINS_PATH,
      ];
      process.env.TIDDLYWIKI_PLUGIN_PATH = pluginPaths.join(pathSeparator);
      process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');

      /**
       * Hook loadWikiTiddlers to inject sub-wiki tiddlers after main wiki is loaded.
       */
      if (subWikis.length > 0) {
        wikiInstance.loadWikiTiddlers = createLoadWikiTiddlersWithSubWikis(
          wikiInstance,
          homePath,
          subWikis,
          workspace.name,
          native,
        );
      }

      // don't add `+` prefix to plugin name here. `+` only used in args[0], but we are not prepend this list to the args list.
      wikiInstance.boot.extraPlugins = [
        // add tiddly filesystem back if is not readonly https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
        readOnlyMode === true ? undefined : 'plugins/tiddlywiki/filesystem',
        /**
         * Enhanced filesystem adaptor that routes tiddlers to sub-wikis based on tags.
         * Replaces the complex string manipulation of $:/config/FileSystemPaths with direct IPC calls to workspace service.
         * Only enabled in non-readonly mode since it handles filesystem operations.
         */
        readOnlyMode === true ? undefined : 'plugins/linonetwo/watch-filesystem-adaptor',
        /**
         * Install $:/plugins/linonetwo/tidgi instead of +plugins/tiddlywiki/tiddlyweb to speedup (without JSON.parse) and fix http errors when network change.
         * See scripts/compilePlugins.mjs for how it is built.
         */
        'plugins/linonetwo/tidgi-ipc-syncadaptor',
        'plugins/linonetwo/tidgi-ipc-syncadaptor-ui',
        enableHTTPAPI ? 'plugins/tiddlywiki/tiddlyweb' : undefined, // we use $:/plugins/linonetwo/tidgi instead
        // 'plugins/linonetwo/watch-fs',
      ].filter(Boolean) as string[];
      /**
       * Make wiki readonly if readonly is true. This is normally used for server mode, so also enable gzip.
       *
       * The principle is to configure anonymous reads, but writes require a login, and then give an unguessable random password here.
       *
       * @url https://wiki.zhiheng.io/static/TiddlyWiki%253A%2520Readonly%2520for%2520Node.js%2520Server.html
       */

      const readonlyArguments = readOnlyMode === true ? ['gzip=yes', 'readers=(anon)', `writers=${userName || nanoid()}`, `username=${userName}`, `password=${nanoid()}`] : [];

      // Preload workspace ID for filesystem adaptor
      const infoTiddlerText = `exports.getInfoTiddlerFields = () => [
        {title: "$:/info/tidgi/readOnlyMode", text: "${readOnlyMode === true ? 'yes' : 'no'}"},
        {title: "$:/info/tidgi/workspaceID", text: ${JSON.stringify(workspace.id)}},
      ]`;
      wikiInstance.preloadTiddler({
        title: '$:/core/modules/info/tidgi-server.js',
        text: infoTiddlerText,
        type: 'application/javascript',
        'module-type': 'info',
      });
      /**
       * Use authenticated-user-header to provide `TIDGI_AUTH_TOKEN_HEADER` as header key to receive a value as username (we use it as token).
       *
       * For example, when server starts with `"readers=s0me7an6om3ey" writers=s0me7an6om3ey" authenticated-user-header=x-tidgi-auth-token`, only when other app query with header `x-tidgi-auth-token: s0me7an6om3ey`, can it get access to the wiki.
       *
       * When this is not enabled, provide a `anon-username` for any users.
       *
       * @url https://github.com/Jermolene/TiddlyWiki5/discussions/7469
       */
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
      /**
       * Set excluded plugins or tiddler content to empty string.
       * Should disable plugins/tiddlywiki/filesystem (so only work in readonly mode), otherwise will write empty string to tiddlers.
       * @url https://github.com/linonetwo/wiki/blob/8f1f091455eec23a9f016d6972b7f38fe85efde1/tiddlywiki.info#LL35C1-L39C20
       */
      const excludePluginsArguments = readOnlyMode === true
        ? [
          '--setfield',
          excludedPlugins.map((pluginOrTiddlerTitle) =>
            // allows filter like `[is[binary]] [type[application/msword]] -[type[application/pdf]]`, but also auto add `[[]]` to plugin title to be like `[[$:/plugins/tiddlywiki/filesystem]]`
            pluginOrTiddlerTitle.includes('[') && pluginOrTiddlerTitle.includes(']') ? pluginOrTiddlerTitle : `[[${pluginOrTiddlerTitle}]]`
          ).join(' '),
          'text',
          '',
          'text/plain',
        ]
        : [];

      fullBootArgv = enableHTTPAPI
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
      wikiInstance.boot.argv = [...fullBootArgv];

      wikiInstance.hooks.addHook('th-server-command-post-start', function(_server: unknown, nodeServer: Server) {
        nodeServer.on('error', function(error: Error) {
          observer.next({ type: 'control', actions: WikiControlActions.error, message: error.message, argv: fullBootArgv });
        });
        // Similar to how updateActiveWikiTheme calls WikiChannel.invokeActionsByTag
        // TODO: now working, can't change theme to dark on start.
        wikiInstance.rootWidget.invokeActionsByTag(DARK_LIGHT_CHANGE_ACTIONS_TAG, new Event('TidGi-invokeActionByTag') as unknown as IWidgetEvent, {
          'dark-mode': shouldUseDarkColors ? 'yes' : 'no',
        });
        nodeServer.on('listening', function() {
          observer.next({
            type: 'control',
            actions: WikiControlActions.listening,
            message:
              `Tiddlywiki listening at http://${tiddlyWikiHost}:${tiddlyWikiPort} (webview uri ip may be different, being nativeService.getLocalHostUrlWithActualInfo(appUrl, workspace.id)) with args ${
                wikiInstance === undefined ? '(wikiInstance is undefined)' : fullBootArgv.join(' ')
              }`,
            argv: fullBootArgv,
          });
        });
      });
      wikiInstance.boot.startup({ bootPath: TIDDLY_WIKI_BOOT_PATH });
      // after setWikiInstance, ipc server routes will start serving content
      ipcServerRoutes.setConfig({ readOnlyMode });
      ipcServerRoutes.setWikiInstance(wikiInstance);
      wikiOperationsInWikiWorker.setWikiInstance(wikiInstance);
      observer.next({
        type: 'control',
        actions: WikiControlActions.booted,
        message: `Tiddlywiki booted with args ${wikiInstance === undefined ? '(wikiInstance is undefined)' : fullBootArgv.join(' ')}`,
        argv: fullBootArgv,
      });
    } catch (error) {
      const message = `Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      observer.next({ type: 'control', source: 'try catch', actions: WikiControlActions.error, message, argv: fullBootArgv });
    }
  });
}
