/**
 * Worker environment is not part of electron environment, so don't import "@/constants/paths" here, as its process.resourcesPath will become undefined and throw Errors.
 *
 * Don't use i18n and logger in worker thread. For example, 12b93020, will throw error "Electron failed to install correctly, please delete node_modules/electron and try installing again ...worker.js..."
 */
import './preload';
import 'source-map-support/register';
import { uninstall } from '@/helpers/installV8Cache';

import { net } from 'electron';
import { handleUtilityProcessMessages } from 'electron-ipc-cat/host';
import { mkdtemp } from 'fs-extra';
import { tmpdir } from 'os';
import path from 'path';
import { Observable } from 'rxjs';

// Log any uncaught errors to stderr before the utility process exits,
// so the main process can capture them via child.stderr.
process.on('uncaughtException', (error: Error) => {
  process.stderr.write(`[wikiWorker] Uncaught exception: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  process.stderr.write(`[wikiWorker] Unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`);
  process.exit(1);
});

// Keep the utility process alive until the wiki HTTP server starts.
// Without this, the process exits when the event loop is empty (after IPC
// handlers are set up but before startNodeJSWiki creates the HTTP server).
// In worker_threads the MessagePort keeps the thread alive, but utilityProcess
// has no such guarantee — we must hold an explicit handle.
// process.stdin.resume() may not work in utilityProcess, so we use a
// keep-alive interval that runs for the lifetime of the worker.
process.stdin?.resume();
setInterval(() => {}, 60000);

// Use the Electron network context assigned when this utility process is
// forked. Its session carries the Wiki-backend proxy configuration.
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const electronInput = input instanceof URL ? input.toString() : input;
  return net.fetch(electronInput, init);
};

import type { IWikiWorkspace } from '@services/workspaces/interface';
import { IZxWorkerMessage, ZxWorkerControlActions } from '../interface';
import type { ITiddlerRoutingInfo } from '../plugin/watchFileSystemAdaptor/tiddlerRoutingInfo';
import { executeScriptInTWContext, executeScriptInZxScriptContext, extractTWContextScripts, type IVariableContextList } from '../plugin/zxPlugin';
import { wikiOperationsInWikiWorker } from '../wikiOperations/executor/wikiOperationInServer';
import { getWikiInstance } from './globals';
import { extractWikiHTML, packetHTMLFromWikiFolder } from './htmlWiki';
import { ipcServerRoutesMethods } from './ipcServerRoutes';
import { notifyServicesReady } from './servicesReady';
import { startNodeJSWiki } from './startNodeJSWiki';

export interface IStartNodeJSWikiConfigs {
  authToken?: string;
  constants: { TIDDLY_WIKI_BOOT_PATH: string; TIDDLYWIKI_BUILT_IN_PLUGINS_PATH: string };
  enableHTTPAPI: boolean;
  excludedPlugins: string[];
  homePath: string;
  https?: {
    enabled: boolean;
    tlsCert?: string | undefined;
    tlsKey?: string | undefined;
  };
  isDev: boolean;
  lifecycleGeneration: string;
  openDebugger?: boolean;
  readOnlyMode?: boolean;
  rootTiddler?: string;
  shouldUseDarkColors: boolean;
  /**
   * Sub-wikis to load their tiddlers into the main wiki.
   * Sorted by order (lower = higher priority).
   * Note: Tag-based routing is handled separately by FileSystemAdaptor.
   */
  subWikis?: IWikiWorkspace[];
  tiddlyWikiHost: string;
  tiddlyWikiPort: number;
  tokenAuth?: boolean;
  userName: string;
  workspace: IWikiWorkspace;
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

async function beforeExit(): Promise<void> {
  uninstall?.uninstall();
  // Cleanup watch-filesystem adaptor
  const wikiInstance = getWikiInstance();
  // Call our custom cleanup method if it exists `src/services/wiki/plugin/watchFileSystemAdaptor/watch-filesystem-adaptor.ts`
  const syncAdaptor = wikiInstance?.syncadaptor as { cleanup?: () => Promise<void> } | undefined;
  if (syncAdaptor?.cleanup) {
    await syncAdaptor.cleanup();
  }
}

async function getTiddlerRoutingInfo(tiddlerTitle: string): Promise<ITiddlerRoutingInfo> {
  const wikiInstance = getWikiInstance();
  const syncAdaptor = wikiInstance?.syncadaptor as { getTiddlerRoutingInfo?: (title: string) => Promise<ITiddlerRoutingInfo> } | undefined;
  if (syncAdaptor?.getTiddlerRoutingInfo) {
    return await syncAdaptor.getTiddlerRoutingInfo(tiddlerTitle);
  }
  return { featureAvailable: false };
}

// All exposed methods should be async.
const wikiWorker = {
  startNodeJSWiki,
  getTiddlerFileMetadata: async (tiddlerTitle: string) => getWikiInstance()?.boot.files[tiddlerTitle],
  getTiddlerRoutingInfo,
  executeZxScript,
  extractWikiHTML,
  packetHTMLFromWikiFolder,
  beforeExit,
  notifyServicesReady,
  probeNetworkProxyForTest: async (url: string) => {
    const response = await fetch(url);
    return await response.text();
  },
  wikiOperation: wikiOperationsInWikiWorker.wikiOperation.bind(wikiOperationsInWikiWorker),
  getMemoryUsage: async () => {
    const mem = process.memoryUsage();
    const toMB = (bytes: number): number => Math.round(bytes / 1024 / 1024);
    return { rss_MB: toMB(mem.rss), heapUsed_MB: toMB(mem.heapUsed), heapTotal_MB: toMB(mem.heapTotal) };
  },
  ...ipcServerRoutesMethods,
};
export type WikiWorker = typeof wikiWorker;

// Initialize utility process message handling
handleUtilityProcessMessages(wikiWorker);
