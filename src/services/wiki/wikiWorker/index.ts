/* eslint-disable unicorn/prefer-native-coercion-functions */
/**
 * Worker environment is not part of electron environment, so don't import "@/constants/paths" here, as its process.resourcesPath will become undefined and throw Errors.
 * 
 * Don't use i18n and logger in worker thread. For example, 12b93020, will throw error "Electron failed to install correctly, please delete node_modules/electron and try installing again ...worker.js..."
 * 
 * Import tw related things and typing from `@tiddlygit/tiddlywiki` instead of `tiddlywiki`, otherwise you will get `Unhandled Error ReferenceError: self is not defined at $:/boot/bootprefix.js:40749:36` because tiddlywiki 
 */
import { uninstall } from '@/helpers/installV8Cache';
import './preload';
import 'source-map-support/register';
import { type IUtils, TiddlyWiki } from '@tiddlygit/tiddlywiki';
import Sqlite3Database from 'better-sqlite3';
import { exists, mkdtemp } from 'fs-extra';
import { tmpdir } from 'os';
import path from 'path';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';

import { isHtmlWiki } from '@/constants/fileNames';
import { ISqliteDatabasePaths, SqliteDatabaseNotInitializedError, WikiWorkerDatabaseOperations } from '@services/database/wikiWorkerOperations';
import { IWikiLogMessage, IZxWorkerMessage, ZxWorkerControlActions } from '../interface';
import { executeScriptInTWContext, executeScriptInZxScriptContext, extractTWContextScripts, type IVariableContextList } from '../plugin/zxPlugin';
import { getWikiInstance, setCacheDatabase } from './globals';
import { ipcServerRoutesMethods } from './ipcServerRoutes';
import { startNodeJSWiki } from './startNodeJSWiki';

export interface IStartNodeJSWikiConfigs {
  authToken?: string;
  constants: { TIDDLYWIKI_PACKAGE_FOLDER: string };
  enableHTTPAPI: boolean;
  excludedPlugins: string[];
  homePath: string;
  https?: {
    enabled: boolean;
    tlsCert?: string | undefined;
    tlsKey?: string | undefined;
  };
  isDev: boolean;
  openDebugger?: boolean;
  readOnlyMode?: boolean;
  rootTiddler?: string;
  tiddlyWikiHost: string;
  tiddlyWikiPort: number;
  tokenAuth?: boolean;
  userName: string;
}

export interface IUtilsWithSqlite extends IUtils {
  Sqlite: Sqlite3Database.Database;
  TidgiCacheDB: WikiWorkerDatabaseOperations;
}

function initCacheDatabase(cacheDatabaseConfig: ISqliteDatabasePaths) {
  return new Observable<IWikiLogMessage>((observer) => {
    try {
      const cacheDatabase = new WikiWorkerDatabaseOperations(cacheDatabaseConfig);
      setCacheDatabase(cacheDatabase);
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
                const wikiInstance = getWikiInstance();
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
  wikiInstance.boot.argv = ['--load', htmlWikiPath, '--savewikifolder', saveWikiFolderPath, 'explodePlugins=no'];
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
  getTiddlerFileMetadata: (tiddlerTitle: string) => getWikiInstance()?.boot?.files?.[tiddlerTitle],
  executeZxScript,
  extractWikiHTML,
  packetHTMLFromWikiFolder,
  beforeExit,
  initCacheDatabase,
  ...ipcServerRoutesMethods,
};
export type WikiWorker = typeof wikiWorker;
expose(wikiWorker);
