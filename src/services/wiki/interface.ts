import { WikiChannel } from '@/constants/channels';
import { IGitUserInfos } from '@services/git/interface';
import { IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';
import { ModuleThread } from 'threads';
import type { IChangedTiddlers } from 'tiddlywiki';
import type { ISubWikiPluginContent } from './plugin/subWikiPlugin';
import { IWikiOperations } from './wikiOperations';
import { WikiWorker } from './wikiWorker';
import { IWikiServerRouteResponse } from './wikiWorker/ipcServerRoutes';
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
  clearAllSyncIntervals(): void;
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
  createSubWiki(parentFolderLocation: string, folderName: string, mainWikiPath: string, tagName?: string, onlyLink?: boolean): Promise<void>;
  ensureWikiExist(wikiPath: string, shouldBeMainWiki: boolean): Promise<void>;
  extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string): Promise<string | undefined>;
  getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]>;
  getTiddlerText(workspace: IWorkspace, title: string): Promise<string | undefined>;
  getWikiChangeObserver$(workspaceID: string): Observable<IChangedTiddlers>;
  getWikiErrorLogs(workspaceID: string, wikiName: string): Promise<{ content: string; filePath: string }>;
  /**
   * Get wiki worker, and you can call its methods. Only meant to be used in TidGi's services internally.
   * @param workspaceID You can get this from active workspace
   */
  getWorker(workspaceID: string): ModuleThread<WikiWorker> | undefined;
  linkWiki(mainWikiPath: string, folderName: string, subWikiPath: string): Promise<void>;
  /**
   * Open image or PDF in OS native viewer or some else usage like this.
   * @param homePath Workspace home path, used to locate wiki worker
   * @param title tiddler title to open
   */
  openTiddlerInExternal(title: string, workspaceID: string): Promise<void>;
  packetHTMLFromWikiFolder(wikiFolderLocation: string, pathOfNewHTML: string): Promise<void>;
  removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink?: boolean): Promise<void>;
  /** send tiddlywiki action message to current active wiki */
  requestWikiSendActionMessage(actionMessage: string): Promise<void>;
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
  updateSubWikiPluginContent(mainWikiPath: string, newConfig?: IWorkspace, oldConfig?: IWorkspace): Promise<void>;
  wikiOperation<OP extends keyof IWikiOperations>(
    operationType: OP,
    ...arguments_: Parameters<IWikiOperations[OP]>
  ): undefined | ReturnType<IWikiOperations[OP]>;
  /** handle start/restart of wiki/subwiki, will handle wiki sync too */
  wikiStartup(workspace: IWorkspace): Promise<void>;
}
export const WikiServiceIPCDescriptor = {
  channel: WikiChannel.name,
  properties: {
    callWikiIpcServerRoute: ProxyPropertyType.Function,
    checkWikiExist: ProxyPropertyType.Function,
    clearAllSyncIntervals: ProxyPropertyType.Function,
    cloneSubWiki: ProxyPropertyType.Function,
    cloneWiki: ProxyPropertyType.Function,
    copyWikiTemplate: ProxyPropertyType.Function,
    createSubWiki: ProxyPropertyType.Function,
    ensureWikiExist: ProxyPropertyType.Function,
    extractWikiHTML: ProxyPropertyType.Function,
    getSubWikiPluginContent: ProxyPropertyType.Function,
    getTiddlerText: ProxyPropertyType.Function,
    getWikiErrorLogs: ProxyPropertyType.Function,
    linkWiki: ProxyPropertyType.Function,
    openTiddlerInExternal: ProxyPropertyType.Function,
    packetHTMLFromWikiFolder: ProxyPropertyType.Function,
    removeWiki: ProxyPropertyType.Function,
    requestWikiSendActionMessage: ProxyPropertyType.Function,
    restartWiki: ProxyPropertyType.Function,
    setWikiLanguage: ProxyPropertyType.Function,
    startWiki: ProxyPropertyType.Function,
    stopAllWiki: ProxyPropertyType.Function,
    stopWiki: ProxyPropertyType.Function,
    updateSubWikiPluginContent: ProxyPropertyType.Function,
    wikiOperation: ProxyPropertyType.Function,
    wikiStartup: ProxyPropertyType.Function,
    getWikiChangeObserver$: ProxyPropertyType.Function$,
  },
};

// Workers

export type IWikiMessage = IWikiLogMessage | IWikiControlMessage;
export interface IWikiLogMessage {
  message: string;
  type: 'stdout' | 'stderr';
}
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
