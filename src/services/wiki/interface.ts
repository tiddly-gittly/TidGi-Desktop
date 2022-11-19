import type { BrowserView } from 'electron';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { WikiChannel } from '@/constants/channels';
import { IWorkspace } from '@services/workspaces/interface';
import { IGitUserInfos } from '@services/git/interface';
import type { ISubWikiPluginContent } from './plugin/subWikiPlugin';
import { IWikiOperations } from './wikiOperations';
import { ModuleThread } from 'threads';
import type { WikiWorker } from './wikiWorker';

/**
 * Handle wiki worker startup and restart
 */
export interface IWikiService {
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
  extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string): Promise<boolean | string>;
  getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]>;
  getTiddlerText(workspace: IWorkspace, title: string): Promise<string | undefined>;
  getWikiLogs(homePath: string): Promise<{ content: string; filePath: string }>;
  /**
   * Get wiki worker, and you can call its methods. Only meant to be used in TidGi's services internally.
   * @param wikiFolderLocation You can get this from active workspace
   */
  getWorker(wikiFolderLocation: string): ModuleThread<WikiWorker> | undefined;
  linkWiki(mainWikiPath: string, folderName: string, subWikiPath: string): Promise<void>;
  /**
   * Open image or PDF in OS native viewer or some else usage like this.
   * @param homePath Workspace home path, used to locate wiki worker
   * @param title tiddler title to open
   */
  openTiddlerInExternal(homePath: string, title: string): Promise<void>;
  packetHTMLFromWikiFolder(folderWikiPath: string, saveWikiHtmlfolder: string): Promise<void>;
  removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink?: boolean): Promise<void>;
  requestOpenTiddlerInWiki(tiddlerName: string): Promise<void>;
  /** send tiddlywiki action message to current active wiki */
  requestWikiSendActionMessage(actionMessage: string): Promise<void>;
  restartWiki(workspace: IWorkspace): Promise<void>;
  runFilterOnWiki(workspace: IWorkspace, filter: string): Promise<string[] | undefined>;
  setAllWikiStartLockOff(): void;
  setWikiLanguage(view: BrowserView, workspaceID: string, tiddlywikiLanguageName: string): Promise<void>;
  /**
   * Lock to prevent some process ask a wiki to start and restart frequently.
   * For example, start main wiki then start sub-wiki, and sub-wiki will try to start its main wiki. */
  setWikiStartLockOn(wikiFolderLocation: string): void;
  /** call wiki worker to actually start nodejs wiki */
  startWiki(homePath: string, tiddlyWikiPort: number, userName: string): Promise<void>;
  stopAllWiki(): Promise<void>;
  stopWiki(homePath: string): Promise<void>;
  updateSubWikiPluginContent(mainWikiPath: string, newConfig?: IWorkspace, oldConfig?: IWorkspace): Promise<void>;
  wikiOperation<OP extends keyof IWikiOperations>(operationType: OP, arguments_: Parameters<IWikiOperations[OP]>): undefined | ReturnType<IWikiOperations[OP]>;
  /** handle start/restart of wiki/subwiki, will handle wiki sync too */
  wikiStartup(workspace: IWorkspace): Promise<void>;
}
export const WikiServiceIPCDescriptor = {
  channel: WikiChannel.name,
  properties: {
    checkWikiExist: ProxyPropertyType.Function,
    clearAllSyncIntervals: ProxyPropertyType.Function,
    cloneSubWiki: ProxyPropertyType.Function,
    cloneWiki: ProxyPropertyType.Function,
    copyWikiTemplate: ProxyPropertyType.Function,
    createSubWiki: ProxyPropertyType.Function,
    ensureWikiExist: ProxyPropertyType.Function,
    getSubWikiPluginContent: ProxyPropertyType.Function,
    getTiddlerText: ProxyPropertyType.Function,
    getWikiLogs: ProxyPropertyType.Function,
    linkWiki: ProxyPropertyType.Function,
    openTiddlerInExternal: ProxyPropertyType.Function,
    removeWiki: ProxyPropertyType.Function,
    requestOpenTiddlerInWiki: ProxyPropertyType.Function,
    requestWikiSendActionMessage: ProxyPropertyType.Function,
    restartWiki: ProxyPropertyType.Function,
    runFilterOnWiki: ProxyPropertyType.Function,
    setWikiLanguage: ProxyPropertyType.Function,
    startWiki: ProxyPropertyType.Function,
    stopAllWiki: ProxyPropertyType.Function,
    stopWiki: ProxyPropertyType.Function,
    updateSubWikiPluginContent: ProxyPropertyType.Function,
    wikiOperation: ProxyPropertyType.Function,
    wikiStartup: ProxyPropertyType.Function,
    // Register here to unpack and package wikiHTML functions
    extractWikiHTML: ProxyPropertyType.Function,
    packetHTMLFromWikiFolder: ProxyPropertyType.Function,
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
  /** means worker is just started */
  start = 'tw-start',
}
export interface IWikiControlMessage {
  actions: WikiControlActions;
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
