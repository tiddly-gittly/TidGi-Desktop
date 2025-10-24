/**
 * Worker environment is not part of electron environment, so don't import "@/constants/paths" here, as its process.resourcesPath will become undefined and throw Errors.
 *
 * Don't use i18n and logger in worker thread. For example, 12b93020, will throw error "Electron failed to install correctly, please delete node_modules/electron and try installing again ...worker.js..."
 */
import { uninstall } from '@/helpers/installV8Cache';
import './preload';
import 'source-map-support/register';
import { handleWorkerMessages } from '@services/libs/workerAdapter';
import { mkdtemp } from 'fs-extra';
import { tmpdir } from 'os';
import path from 'path';
import { Observable } from 'rxjs';

import { IZxWorkerMessage, ZxWorkerControlActions } from '../interface';
import { executeScriptInTWContext, executeScriptInZxScriptContext, extractTWContextScripts, type IVariableContextList } from '../plugin/zxPlugin';
import { wikiOperationsInWikiWorker } from '../wikiOperations/executor/wikiOperationInServer';
import { getWikiInstance } from './globals';
import { extractWikiHTML, packetHTMLFromWikiFolder } from './htmlWiki';
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
  workspaceID: string;
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
            switch (scriptInContext.context) {
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

function beforeExit(): void {
  uninstall?.uninstall();
}

const wikiWorker = {
  startNodeJSWiki,
  getTiddlerFileMetadata: (tiddlerTitle: string) => getWikiInstance()?.boot.files[tiddlerTitle],
  executeZxScript,
  extractWikiHTML,
  packetHTMLFromWikiFolder,
  beforeExit,
  wikiOperation: wikiOperationsInWikiWorker.wikiOperation.bind(wikiOperationsInWikiWorker),
  ...ipcServerRoutesMethods,
};
export type WikiWorker = typeof wikiWorker;

// Initialize worker message handling
handleWorkerMessages(wikiWorker);
