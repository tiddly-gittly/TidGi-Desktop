/* eslint-disable unicorn/prefer-native-coercion-functions */
/**
 * Worker environment is not part of electron environment, so don't import "@/constants/paths" here, as its process.resourcesPath will become undefined and throw Errors.
 * 
 * Don't use i18n and logger in worker thread. For example, 12b93020, will throw error "Electron failed to install correctly, please delete node_modules/electron and try installing again ...worker.js..."
 * 
 * Import tw related things and typing from `@tiddlygit/tiddlywiki` instead of `tiddlywiki`, otherwise you will get `Unhandled Error ReferenceError: self is not defined at $:/boot/bootprefix.js:40749:36` because tiddlywiki 
 */
import { uninstall } from '@/helpers/installV8Cache';
import 'source-map-support/register';
import { type ITiddlyWiki, type IUtils, TiddlyWiki } from '@tiddlygit/tiddlywiki';
import { exists, mkdtemp } from 'fs-extra';
import intercept from 'intercept-stdout';
import { nanoid } from 'nanoid';
import { tmpdir } from 'os';
import path from 'path';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';

import { getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { isHtmlWiki } from '@/constants/fileNames';
import { defaultServerIP } from '@/constants/urls';
import { ISqliteDatabasePaths, SqliteDatabaseNotInitializedError, WikiWorkerDatabaseOperations } from '@services/database/wikiWorkerOperations';
import { fixPath } from '@services/libs/fixPath';
import { IWikiLogMessage, IWikiMessage, IZxWorkerMessage, WikiControlActions, ZxWorkerControlActions } from './interface';
import { executeScriptInTWContext, executeScriptInZxScriptContext, extractTWContextScripts, type IVariableContextList } from './plugin/zxPlugin';
import { adminTokenIsProvided } from './wikiWorkerUtils';

fixPath();
let wikiInstance: ITiddlyWiki | undefined;
let cacheDatabase: WikiWorkerDatabaseOperations | undefined;

export interface IStartNodeJSWikiConfigs {
  adminToken?: string;
  constants: { TIDDLYWIKI_PACKAGE_FOLDER: string };
  excludedPlugins: string[];
  homePath: string;
  https?: {
    enabled: boolean;
    tlsCert?: string | undefined;
    tlsKey?: string | undefined;
  };
  isDev: boolean;
  readOnlyMode?: boolean;
  rootTiddler?: string;
  tiddlyWikiHost: string;
  tiddlyWikiPort: number;
  tokenAuth?: boolean;
  userName: string;
}

export interface IUtilsWithSqlite extends IUtils {
  Sqlite: WikiWorkerDatabaseOperations;
}

function initCacheDatabase(cacheDatabaseConfig: ISqliteDatabasePaths) {
  return new Observable<IWikiLogMessage>((observer) => {
    try {
      cacheDatabase = new WikiWorkerDatabaseOperations(cacheDatabaseConfig);
    } catch (error) {
      if (error instanceof SqliteDatabaseNotInitializedError) {
        // this is usual for first time
        observer.next({ type: 'stdout', message: error.message });
      } else {
        // unexpected error
        observer.next({ type: 'stderr', message: (error as Error)?.message });
      }
    }
  });
}

function startNodeJSWiki({
  adminToken,
  constants: { TIDDLYWIKI_PACKAGE_FOLDER },
  excludedPlugins = [],
  homePath,
  https,
  isDev,
  readOnlyMode,
  rootTiddler,
  tiddlyWikiHost = defaultServerIP,
  tiddlyWikiPort = 5112,
  tokenAuth,
  userName,
}: IStartNodeJSWikiConfigs): Observable<IWikiMessage> {
  return new Observable<IWikiMessage>((observer) => {
    let fullBootArgv: string[] = [];
    observer.next({ type: 'control', actions: WikiControlActions.start, argv: fullBootArgv });
    intercept(
      (newStdOut: string) => {
        observer.next({ type: 'stdout', message: newStdOut });
      },
      (newStdError: string) => {
        observer.next({ type: 'control', source: 'intercept', actions: WikiControlActions.error, message: newStdError, argv: fullBootArgv });
      },
    );

    try {
      wikiInstance = TiddlyWiki();
      // mount database to $tw
      if (wikiInstance !== undefined && cacheDatabase !== undefined) {
        (wikiInstance.utils as IUtilsWithSqlite).Sqlite = cacheDatabase;
      }
      process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
      process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
      const builtInPluginArguments = [
        // add tiddly filesystem back if is not readonly https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
        readOnlyMode === true ? undefined : '+plugins/tiddlywiki/filesystem',
        '+plugins/tiddlywiki/tiddlyweb',
        // '+plugins/linonetwo/watch-fs',
      ].filter((a): a is string => Boolean(a));
      /**
       * Make wiki readonly if readonly is true. This is normally used for server mode, so also enable gzip.
       *
       * The principle is to configure anonymous reads, but writes require a login, and then give an unguessable random password here.
       *
       * @url https://wiki.zhiheng.io/static/TiddlyWiki%253A%2520Readonly%2520for%2520Node.js%2520Server.html
       */
      const readonlyArguments = readOnlyMode === true ? ['gzip=yes', 'readers=(anon)', `writers=${userName}`, `username=${userName}`, `password=${nanoid()}`] : [];
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
        if (adminTokenIsProvided(adminToken)) {
          tokenAuthenticateArguments = [`authenticated-user-header=${getTidGiAuthHeaderWithToken(adminToken)}`, `readers=${userName}`, `writers=${userName}`];
        } else {
          observer.next({ type: 'control', actions: WikiControlActions.error, message: 'tokenAuth is true, but adminToken is empty, this can be a bug.', argv: fullBootArgv });
        }
      }
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

      fullBootArgv = [
        ...builtInPluginArguments,
        homePath,
        '--listen',
        `port=${tiddlyWikiPort}`,
        `host=${tiddlyWikiHost}`,
        `root-tiddler=${rootTiddler ?? '$:/core/save/lazy-images'}`,
        ...httpsArguments,
        ...readonlyArguments,
        ...tokenAuthenticateArguments,
        ...excludePluginsArguments,
        // `debug-level=${isDev ? 'full' : 'none'}`,
      ];
      wikiInstance.boot.argv = [...fullBootArgv];

      wikiInstance.hooks.addHook('th-server-command-post-start', function(listenCommand, server) {
        server.on('error', function(error: Error) {
          observer.next({ type: 'control', actions: WikiControlActions.error, message: error.message, argv: fullBootArgv });
        });
        server.on('listening', function() {
          observer.next({
            type: 'control',
            actions: WikiControlActions.booted,
            message:
              `Tiddlywiki booted at http://${tiddlyWikiHost}:${tiddlyWikiPort} (webview uri ip may be different, being nativeService.getLocalHostUrlWithActualInfo(appUrl, workspace.id)) with args ${
                wikiInstance === undefined ? '(wikiInstance is undefined)' : fullBootArgv.join(' ')
              }`,
            argv: fullBootArgv,
          });
        });
      });
      wikiInstance.boot.startup({ bootPath: TIDDLYWIKI_PACKAGE_FOLDER });
    } catch (error) {
      const message = `Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      observer.next({ type: 'control', source: 'try catch', actions: WikiControlActions.error, message, argv: fullBootArgv });
    }
  });
}

export type IZxFileInput = { fileContent: string; fileName: string } | { filePath: string };
function executeZxScript(file: IZxFileInput, zxPath: string): Observable<IZxWorkerMessage> {
  /** this will be observed in src/services/native/index.ts */
  return new Observable<IZxWorkerMessage>((observer) => {
    observer.next({ type: 'control', actions: ZxWorkerControlActions.start });

    let filePathToExecute: string;
    void (async function executeZxScriptIIFE() {
      try {
        if ('fileName' in file) {
          // codeblock mode, eval a string that might have different contexts separated by TW_SCRIPT_SEPARATOR
          const temporaryDirectory = await mkdtemp(`${tmpdir()}${path.sep}`);
          filePathToExecute = path.join(temporaryDirectory, file.fileName);
          const scriptsInDifferentContext = extractTWContextScripts(file.fileContent);
          /**
           * Store each script's variable context in an array, so that we can restore them later in next context.
           * Key is the variable name, value is the variable value.
           */
          const variableContextList: IVariableContextList = [];
          for (const [index, scriptInContext] of scriptsInDifferentContext.entries()) {
            switch (scriptInContext?.context) {
              case 'zx': {
                await executeScriptInZxScriptContext({ zxPath, filePathToExecute }, observer, scriptInContext.content, variableContextList, index);
                break;
              }
              case 'tw-server': {
                if (wikiInstance === undefined) {
                  observer.next({ type: 'stderr', message: `Error in executeZxScript(): $tw is undefined` });
                  break;
                }
                executeScriptInTWContext(scriptInContext.content, observer, wikiInstance, variableContextList, index);
                break;
              }
            }
          }
        } else if ('filePath' in file) {
          // simple mode, only execute a designated file
          filePathToExecute = file.filePath;
          await executeScriptInZxScriptContext({ zxPath, filePathToExecute }, observer);
        }
      } catch (error) {
        const message = `zx script's executeZxScriptIIFE() failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
        observer.next({ type: 'control', actions: ZxWorkerControlActions.error, message });
      }
    })();
  });
}

async function extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string, constants: { TIDDLYWIKI_PACKAGE_FOLDER: string }): Promise<void> {
  // tiddlywiki --load ./mywiki.html --savewikifolder ./mywikifolder
  // --savewikifolder <wikifolderpath> [<filter>]
  // . /mywikifolder is the path where the tiddlder and plugins folders are stored
  const { TIDDLYWIKI_PACKAGE_FOLDER } = constants;

  if (!isHtmlWiki(htmlWikiPath)) {
    throw new Error(`Please enter the path to the tiddlywiki.html file. Current path can't be used. ${htmlWikiPath}`);
  }
  if (await exists(saveWikiFolderPath)) {
    throw new Error(`A folder already exists at this path, and a new knowledge base cannot be created here. ${saveWikiFolderPath}`);
  }
  const wikiInstance = TiddlyWiki();
  wikiInstance.boot.argv = ['--load', htmlWikiPath, '--savewikifolder', saveWikiFolderPath];
  await new Promise<void>((resolve, reject) => {
    try {
      wikiInstance.boot.startup({
        // passing bootPath inside TidGi app. fix The "path" argument must be of type string. Received undefined
        bootPath: TIDDLYWIKI_PACKAGE_FOLDER,
        callback: () => {
          resolve();
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function packetHTMLFromWikiFolder(folderWikiPath: string, pathOfNewHTML: string, constants: { TIDDLYWIKI_PACKAGE_FOLDER: string }): Promise<void> {
  // tiddlywiki ./mywikifolder --rendertiddler '$:/core/save/all' mywiki.html text/plain
  // . /mywikifolder is the path to the wiki folder, which generally contains the tiddlder and plugins directories
  const { TIDDLYWIKI_PACKAGE_FOLDER } = constants;
  const wikiInstance = TiddlyWiki();
  // a .html file path should be provided, but if provided a folder path, we can add /index.html to fix it.
  wikiInstance.boot.argv = [folderWikiPath, '--rendertiddler', '$:/core/save/all', isHtmlWiki(pathOfNewHTML) ? pathOfNewHTML : `${pathOfNewHTML}/index.html`, 'text/plain'];
  await new Promise<void>((resolve, reject) => {
    try {
      wikiInstance.boot.startup({
        // passing bootPath inside TidGi app. fix The "path" argument must be of type string. Received undefined
        bootPath: TIDDLYWIKI_PACKAGE_FOLDER,
        callback: () => {
          resolve();
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

function beforeExit(): void {
  uninstall?.uninstall();
}

const wikiWorker = {
  startNodeJSWiki,
  getTiddlerFileMetadata: (tiddlerTitle: string) => wikiInstance?.boot?.files?.[tiddlerTitle],
  executeZxScript,
  extractWikiHTML,
  packetHTMLFromWikiFolder,
  beforeExit,
  initCacheDatabase,
};
export type WikiWorker = typeof wikiWorker;
expose(wikiWorker);
