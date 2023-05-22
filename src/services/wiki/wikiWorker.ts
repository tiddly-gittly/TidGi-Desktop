/**
 * Worker environment is not part of electron environment, so don't import "@/constants/paths" here, as its process.resourcesPath will become undefined and throw Errors.
 * 
 * Don't use i18n and logger in worker thread. For example, 12b93020, will throw error "Electron failed to install correctly, please delete node_modules/electron and try installing again ...worker.js..."
 */
import { uninstall } from '@/helpers/installV8Cache';
import 'source-map-support/register';
import { type ITiddlyWiki, TiddlyWiki } from '@tiddlygit/tiddlywiki';
import { fork } from 'child_process';
import { exists, mkdtemp, writeFile } from 'fs-extra';
import intercept from 'intercept-stdout';
import { nanoid } from 'nanoid';
import { tmpdir } from 'os';
import path from 'path';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';

import { getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { defaultServerIP } from '@/constants/urls';
import { fixPath } from '@services/libs/fixPath';
import { IWikiMessage, IZxWorkerMessage, WikiControlActions, ZxWorkerControlActions } from './interface';
import { executeScriptInTWContext, extractTWContextScripts, getTWVmContext } from './plugin/zxPlugin';
import { adminTokenIsProvided } from './wikiWorkerUtils';

fixPath();
let wikiInstance: ITiddlyWiki | undefined;

function startNodeJSWiki({
  adminToken,
  constants: { TIDDLYWIKI_PACKAGE_FOLDER },
  homePath,
  https,
  isDev,
  readOnlyMode,
  rootTiddler,
  tiddlyWikiHost = defaultServerIP,
  tiddlyWikiPort = 5112,
  tokenAuth,
  userName,
}: {
  adminToken?: string;
  constants: { TIDDLYWIKI_PACKAGE_FOLDER: string };
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
}): Observable<IWikiMessage> {
  return new Observable<IWikiMessage>((observer) => {
    observer.next({ type: 'control', actions: WikiControlActions.start });
    intercept(
      (newStdOut: string) => {
        observer.next({ type: 'stdout', message: newStdOut });
      },
      (newStdError: string) => {
        observer.next({ type: 'control', source: 'intercept', actions: WikiControlActions.error, message: newStdError });
      },
    );

    try {
      wikiInstance = TiddlyWiki();
      process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
      process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
      const builtInPluginArguments = [
        // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
        '+plugins/tiddlywiki/filesystem',
        '+plugins/tiddlywiki/tiddlyweb',
        // '+plugins/linonetwo/watch-fs',
      ];
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
          observer.next({ type: 'control', actions: WikiControlActions.error, message: 'tokenAuth is true, but adminToken is empty, this can be a bug.' });
        }
      }
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      const httpsArguments = https?.enabled && https.tlsKey && https.tlsCert
        ? [`tls-key=${https.tlsKey}`, `tls-cert=${https.tlsCert}`]
        : [];

      wikiInstance.boot.argv = [
        ...builtInPluginArguments,
        homePath,
        '--listen',
        `port=${tiddlyWikiPort}`,
        `host=${tiddlyWikiHost}`,
        `root-tiddler=${rootTiddler ?? '$:/core/save/lazy-images'}`,
        ...httpsArguments,
        ...readonlyArguments,
        ...tokenAuthenticateArguments,
        `debug-level=${isDev ? 'full' : 'none'}`,
      ];

      wikiInstance.hooks.addHook('th-server-command-post-start', function(listenCommand, server) {
        server.on('error', function(error: Error) {
          observer.next({ type: 'control', actions: WikiControlActions.error, message: error.message });
        });
        server.on('listening', function() {
          observer.next({
            type: 'control',
            actions: WikiControlActions.booted,
            message:
              `Tiddlywiki booted at http://${tiddlyWikiHost}:${tiddlyWikiPort} (webview uri ip may be different, being nativeService.getLocalHostUrlWithActualInfo(appUrl, workspace.id)) with args ${
                wikiInstance === undefined ? '(wikiInstance is undefined)' : wikiInstance.boot.argv.join(' ')
              }`,
          });
        });
      });
      wikiInstance.boot.startup({ bootPath: TIDDLYWIKI_PACKAGE_FOLDER });
    } catch (error) {
      const message = `Tiddlywiki booted failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      observer.next({ type: 'control', source: 'try catch', actions: WikiControlActions.error, message });
    }
  });
}

export type IZxFileInput = { fileContent: string; fileName: string } | { filePath: string };
function executeZxScript(file: IZxFileInput, zxPath: string): Observable<IZxWorkerMessage> {
  /** this will be observed in src/services/native/index.ts */
  return new Observable<IZxWorkerMessage>((observer) => {
    observer.next({ type: 'control', actions: ZxWorkerControlActions.start });

    void (async function executeZxScriptIIFE() {
      try {
        let filePathToExecute = '';
        if ('fileName' in file) {
          const temporaryDirectory = await mkdtemp(`${tmpdir()}${path.sep}`);
          filePathToExecute = path.join(temporaryDirectory, file.fileName);
          await writeFile(filePathToExecute, file.fileContent);
        } else if ('filePath' in file) {
          filePathToExecute = file.filePath;
        }
        const execution = fork(zxPath, [filePathToExecute], { silent: true });

        execution.on('close', function(code) {
          observer.next({ type: 'control', actions: ZxWorkerControlActions.ended, message: `child process exited with code ${String(code)}` });
        });
        execution.stdout?.on('data', (stdout: Buffer) => {
          // if there are multiple console.log, their output will be concatenated into this stdout. And some of them are not intended to be executed. We use TW_SCRIPT_SEPARATOR to allow user determine the range they want to execute in the $tw context.
          const message = String(stdout);
          const zxConsoleLogMessages = extractTWContextScripts(message);
          // log and execute each different console.log result.
          zxConsoleLogMessages.forEach(({ messageType, content }) => {
            if (messageType === 'script') {
              observer.next({ type: 'execution', message: content });
              if (wikiInstance === undefined) {
                observer.next({ type: 'stderr', message: `Error in executeZxScript(): $tw is undefined` });
              } else {
                const context = getTWVmContext(wikiInstance);
                const twExecutionResult = executeScriptInTWContext(content, context);
                observer.next({ type: 'stdout', message: twExecutionResult.join('\n\n') });
              }
            } else {
              observer.next({ type: 'stdout', message: content });
            }
          });
        });
        execution.stderr?.on('data', (stdout: Buffer) => {
          observer.next({ type: 'stderr', message: String(stdout) });
        });
        execution.on('error', (error) => {
          observer.next({ type: 'stderr', message: `${error.message} ${error.stack ?? ''}` });
        });
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
  const reg = /(?:html|htm|Html|HTML|HTM|HTA|hta)$/;
  const isHtmlWiki = reg.test(htmlWikiPath);
  if (!isHtmlWiki) {
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

async function packetHTMLFromWikiFolder(folderWikiPath: string, folderToSaveWikiHtml: string, constants: { TIDDLYWIKI_PACKAGE_FOLDER: string }): Promise<void> {
  // tiddlywiki ./mywikifolder --rendertiddler '$:/core/save/all' mywiki.html text/plain
  // . /mywikifolder is the path to the wiki folder, which generally contains the tiddlder and plugins directories
  const { TIDDLYWIKI_PACKAGE_FOLDER } = constants;
  const wikiInstance = TiddlyWiki();
  wikiInstance.boot.argv = [folderWikiPath, '--rendertiddler', '$:/core/save/all', folderToSaveWikiHtml, 'text/plain'];
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
};
export type WikiWorker = typeof wikiWorker;
expose(wikiWorker);
