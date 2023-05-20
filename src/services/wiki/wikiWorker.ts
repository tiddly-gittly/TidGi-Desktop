/**
 * Worker environment is not part of electron environment, so don't import "@/constants/paths" here, as its process.resourcesPath will become undefined and throw Errors
 */
import { uninstall } from '@/helpers/installV8Cache';
import 'source-map-support/register';
import { type ITiddlyWiki, TiddlyWiki } from '@tiddlygit/tiddlywiki';
import { fork } from 'child_process';
import fs from 'fs';
import { mkdtemp, writeFile } from 'fs-extra';
import intercept from 'intercept-stdout';
import { nanoid } from 'nanoid';
import { tmpdir } from 'os';
import path from 'path';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';

import { defaultServerIP } from '@/constants/urls';
import { fixPath } from '@services/libs/fixPath';
import { IWikiMessage, IZxWorkerMessage, WikiControlActions, ZxWorkerControlActions } from './interface';
import { executeScriptInTWContext, extractTWContextScripts, getTWVmContext } from './plugin/zxPlugin';

fixPath();
let wikiInstance: ITiddlyWiki | undefined;

function startNodeJSWiki({
  homePath,
  readonly,
  tiddlyWikiHost = defaultServerIP,
  tiddlyWikiPort = 5112,
  userName,
  rootTiddler,
  constants: { TIDDLYWIKI_PACKAGE_FOLDER },
}: {
  constants: { TIDDLYWIKI_PACKAGE_FOLDER: string };
  homePath: string;
  readonly?: boolean;
  rootTiddler?: string;
  tiddlyWikiHost: string;
  tiddlyWikiPort: number;
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
      /**
       * Make wiki readonly if readonly is true. This is normally used for server mode, so also enable gzip.
       *
       * The principle is to configure anonymous reads, but writes require a login, and then give an unguessable username and password to.
       *
       * @url https://wiki.zhiheng.io/static/TiddlyWiki%253A%2520Readonly%2520for%2520Node.js%2520Server.html
       */
      const readonlyArguments = readonly === true ? ['gzip=yes', '"readers=(anon)"', `writers=${userName}`, `username=${userName}`, `password=${nanoid()}`] : [];
      wikiInstance.boot.argv = [
        // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
        '+plugins/tiddlywiki/filesystem',
        '+plugins/tiddlywiki/tiddlyweb',
        // '+plugins/linonetwo/watch-fs',
        homePath,
        '--listen',
        `anon-username=${userName}`,
        `port=${tiddlyWikiPort}`,
        `host=${tiddlyWikiHost}`,
        `root-tiddler=${rootTiddler ?? '$:/core/save/lazy-images'}`,
        ...readonlyArguments,
      ];
      wikiInstance.hooks.addHook('th-server-command-post-start', function(listenCommand, server) {
        server.on('error', function(error: Error) {
          observer.next({ type: 'control', actions: WikiControlActions.error, message: error.message });
        });
        server.on('listening', function() {
          observer.next({
            type: 'control',
            actions: WikiControlActions.booted,
            message: `Tiddlywiki booted at http://${tiddlyWikiHost}:${tiddlyWikiPort} (webview uri ip may be different, being getLocalHostUrlWithActualIP()) with args ${
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

// eslint-disable-next-line @typescript-eslint/promise-function-async
function extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string): Promise<boolean> {
  // tiddlywiki --load ./mywiki.html --savewikifolder ./mywikifolder
  // --savewikifolder <wikifolderpath> [<filter>]
  // . /mywikifolder is the path where the tiddlder and plugins folders are stored
  return new Promise((resolve, reject) => {
    let extractState = false;
    // eslint-disable-next-line prefer-regex-literals
    const reg = new RegExp(/(?:html|htm|Html|HTML|HTM)$/);
    const isHtmlWiki = reg.test(htmlWikiPath);
    if (!isHtmlWiki) {
      const message = 'Please enter the path to the tiddlywiki.html file. But the current path is: ' + htmlWikiPath;
      console.error(message);
      reject(message);
    } else if (fs.existsSync(saveWikiFolderPath)) {
      const message = 'Error: The unpackwiki command requires that the output wiki folder be empty: ' + htmlWikiPath;
      console.error(message);
      reject(message);
    } else {
      try {
        const wikiInstance = TiddlyWiki();
        wikiInstance.boot.argv = ['--load', htmlWikiPath, '--savewikifolder', saveWikiFolderPath];
        wikiInstance.boot.startup({
          callback: () => {
            resolve(true);
          },
        });
        // eslint-disable-next-line security-node/detect-crlf
        console.log('Extract Wiki Html Successful: ' + saveWikiFolderPath);
        extractState = true;
      } catch (error) {
        const message = `Tiddlywiki extractWikiHTML with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
        console.error(message);
      }
    }
    return extractState;
  });
}

// eslint-disable-next-line @typescript-eslint/promise-function-async
function packetHTMLFromWikiFolder(folderWikiPath: string, saveWikiHtmlFolder: string): Promise<boolean> {
  // tiddlywiki ./mywikifolder --rendertiddler '$:/core/save/all' mywiki.html text/plain
  // . /mywikifolder is the path to the wiki folder, which generally contains the tiddlder and plugins directories
  return new Promise((resolve, reject) => {
    try {
      const wikiInstance = TiddlyWiki();
      wikiInstance.boot.argv = [folderWikiPath, '--rendertiddler', '$:/core/save/all', saveWikiHtmlFolder, 'text/plain'];
      wikiInstance.boot.startup({
        callback: () => {
          resolve(true);
        },
      });
    } catch (error) {
      const message = `Tiddlywiki packetHTMLFromWikiFolder with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      console.error(message);
      reject(message);
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
