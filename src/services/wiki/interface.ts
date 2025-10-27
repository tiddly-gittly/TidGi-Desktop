import { WikiChannel } from '@/constants/channels';
import type { IGitUserInfos } from '@services/git/interface';
import type { IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';
import type { IChangedTiddlers } from 'tiddlywiki';
import type { IWorkerWikiOperations } from './wikiOperations/executor/wikiOperationInServer';
import type { ISendWikiOperationsToBrowser } from './wikiOperations/sender/sendWikiOperationsToBrowser';
import type { WikiWorker } from './wikiWorker';
import type { IWikiServerRouteResponse } from './wikiWorker/ipcServerRoutes';
import type { IpcServerRouteMethods, IpcServerRouteNames } from './wikiWorker/ipcServerRoutes';

/**
 * Handle wiki worker startup and restart
 */
export interface IWikiService {
  /**
   * Call wiki worker route methods, and return response.
   * Methods are copy from core/modules/server/routes , to support the IPC communication between renderer's browserView and main process and wiki worker.
   */
  callWikiIpcServerRoute<NAME extends IpcServerRouteNames>(
    workspaceID: string,
    route: NAME,
    ...arguments_: Parameters<IpcServerRouteMethods[NAME]>
  ): Promise<IWikiServerRouteResponse | undefined>;
  /** return true if wiki does existed and folder is a valid tiddlywiki folder, return error message (a string) if there is an error checking wiki existence */
  checkWikiExist(workspace: IWorkspace, options?: { shouldBeMainWiki?: boolean; showDialog?: boolean }): Promise<string | true>;
  checkWikiStartLock(wikiFolderLocation: string): boolean;
  cloneSubWiki(
    parentFolderLocation: string,
    wikiFolderName: string,
    mainWikiPath: string,
    gitRepoUrl: string,
    gitUserInfo: IGitUserInfos,
    tagName?: string,
  ): Promise<void>;
  cloneWiki(parentFolderLocation: string, wikiFolderName: string, gitRepoUrl: string, gitUserInfo: IGitUserInfos): Promise<void>;
  copyWikiTemplate(newFolderPath: string, folderName: string): Promise<void>;
  /**
   * create sub wiki in a parent folder, and link to a main wiki, and set tagName to filesystemPath.tid
   * @param parentFolderLocation
   * @param folderName
   * @param mainWikiToLink
   * @param onlyLink not creating new subwiki folder, just link existed subwiki folder to main wiki folder
   */
  createSubWiki(parentFolderLocation: string, folderName: string, subWikiFolderName: string, mainWikiPath: string, tagName?: string, onlyLink?: boolean): Promise<void>;
  ensureWikiExist(wikiPath: string, shouldBeMainWiki: boolean): Promise<void>;
  extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string): Promise<string | undefined>;
  /**
   * Get tiddler's absolute path. So you can open image or PDF in OS native viewer or some else usage like this, using `window?.service?.native?.openPath?.(filePath)`
   * @returns absolute path like `'/Users/linonetwo/Desktop/repo/TiddlyGit-Desktop/wiki-dev/wiki/tiddlers/Index.tid'`
   * @param homePath Workspace home path, used to locate wiki worker
   * @param title tiddler title to open
   */
  getTiddlerFilePath(title: string, workspaceID?: string): Promise<string | undefined>;
  getWikiChangeObserver$(workspaceID: string): Observable<IChangedTiddlers>;
  getWikiErrorLogs(workspaceID: string, wikiName: string): Promise<{ content: string; filePath: string }>;
  /**
   * Get wiki worker, and you can call its methods. Only meant to be used in TidGi's services internally.
   * @param workspaceID You can get this from active workspace
   */
  getWorker(workspaceID: string): WikiWorker | undefined;
  linkWiki(mainWikiPath: string, folderName: string, subWikiPath: string): Promise<void>;
  packetHTMLFromWikiFolder(wikiFolderLocation: string, pathOfNewHTML: string): Promise<void>;
  removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink?: boolean): Promise<void>;
  restartWiki(workspace: IWorkspace): Promise<void>;
  setAllWikiStartLockOff(): void;
  setWikiLanguage(workspaceID: string, tiddlywikiLanguageName: string): Promise<void>;
  /**
   * Lock to prevent some process ask a wiki to start and restart frequently.
   * For example, start main wiki then start sub-wiki, and sub-wiki will try to start its main wiki. */
  setWikiStartLockOn(workspaceID: string): void;
  /** call wiki worker to actually start nodejs wiki */
  startWiki(workspaceID: string, userName: string): Promise<void>;
  stopAllWiki(): Promise<void>;
  stopWiki(workspaceID: string): Promise<void>;
  /**
   * Runs wiki related JS script in wiki page to control the wiki.
   *
   * Some data may not be available in browser, for example, getTiddlerText will return `null` for the first time, and trigger lazy loading, and return text on second call. In such case, you may want to use `wikiOperationInServer` instead.
   * @example `await window.service.wiki.wikiOperationInBrowser('wiki-get-tiddler-text', window.meta().workspaceID, ['TiddlyWikiIconBlack.png'])`
   */
  wikiOperationInBrowser<OP extends keyof ISendWikiOperationsToBrowser>(
    operationType: OP,
    workspaceID: string,
    arguments_: Parameters<ISendWikiOperationsToBrowser[OP]>,
  ): Promise<ReturnType<ISendWikiOperationsToBrowser[OP]>>;
  /**
   * Runs wiki related JS script in nodejs server side.
   *
   * This will never await if workspaceID isn't exist in user's workspace list. So prefer to check workspace existence before use this method.
   */
  wikiOperationInServer<OP extends keyof IWorkerWikiOperations>(
    operationType: OP,
    workspaceID: string,
    arguments_: Parameters<IWorkerWikiOperations[OP]>,
  ): Promise<ReturnType<IWorkerWikiOperations[OP]>>;
  /** handle start/restart of wiki/subwiki, will handle wiki sync too */
  wikiStartup(workspace: IWorkspace): Promise<void>;
}
export const WikiServiceIPCDescriptor = {
  channel: WikiChannel.name,
  properties: {
    callWikiIpcServerRoute: ProxyPropertyType.Function,
    checkWikiExist: ProxyPropertyType.Function,
    cloneSubWiki: ProxyPropertyType.Function,
    cloneWiki: ProxyPropertyType.Function,
    copyWikiTemplate: ProxyPropertyType.Function,
    createSubWiki: ProxyPropertyType.Function,
    ensureWikiExist: ProxyPropertyType.Function,
    extractWikiHTML: ProxyPropertyType.Function,
    getWikiErrorLogs: ProxyPropertyType.Function,
    linkWiki: ProxyPropertyType.Function,
    getTiddlerFilePath: ProxyPropertyType.Function,
    packetHTMLFromWikiFolder: ProxyPropertyType.Function,
    removeWiki: ProxyPropertyType.Function,
    restartWiki: ProxyPropertyType.Function,
    setWikiLanguage: ProxyPropertyType.Function,
    startWiki: ProxyPropertyType.Function,
    stopAllWiki: ProxyPropertyType.Function,
    stopWiki: ProxyPropertyType.Function,
    wikiOperationInBrowser: ProxyPropertyType.Function,
    wikiOperationInServer: ProxyPropertyType.Function,
    wikiStartup: ProxyPropertyType.Function,
    getWikiChangeObserver$: ProxyPropertyType.Function$,
  },
};

// Workers

export type IWikiMessage = IWikiControlMessage;
export enum WikiControlActions {
  /** wiki is booted */
  booted = 'tw-booted',
  error = 'tw-error',
  listening = 'tw-listening',
  /** means worker is just started */
  start = 'tw-start',
}
export interface IWikiControlMessage {
  actions: WikiControlActions;
  argv: string[];
  message?: string;
  /** where this bug rise, helps debug */
  source?: string;
  type: 'control';
}

export type IZxWorkerMessage = IZxWorkerLogMessage | IZxWorkerControlMessage;
export interface IZxWorkerLogMessage {
  message: string;
  type: 'stdout' | 'stderr' | 'execution';
}
export enum ZxWorkerControlActions {
  ended = 'zx-ended',
  error = 'zx-error',
  /** means worker is just started */
  start = 'zx-start',
}
export interface IZxWorkerControlMessage {
  actions: ZxWorkerControlActions;
  message?: string;
  type: 'control';
}
