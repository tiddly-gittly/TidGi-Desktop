import type { BrowserView } from 'electron';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { WikiChannel } from '@/constants/channels';
import { IWorkspace } from '@services/workspaces/interface';
import { IGitUserInfos } from '@services/git/interface';
import type { ISubWikiPluginContent } from './plugin/subWikiPlugin';
import { IWikiOperations } from './wikiOperations';

export type IWikiMessage = IWikiLogMessage | IWikiControlMessage;
export interface IWikiLogMessage {
  message: string;
  type: 'stdout' | 'stderr';
}
export enum WikiControlActions {
  /** wiki is booted */
  booted = 'booted',
  error = 'error',
  /** means worker is just started */
  start = 'start',
}
export interface IWikiControlMessage {
  actions: WikiControlActions;
  message?: string;
  type: 'control';
}

/**
 * Handle wiki worker startup and restart
 */
export interface IWikiService {
  /** return true if wiki does existed, return error message (a string) if there is an error checking wiki existence */
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
  createSubWiki(parentFolderLocation: string, folderName: string, mainWikiPath: string, tagName?: string, onlyLink?: boolean): Promise<void>;
  ensureWikiExist(wikiPath: string, shouldBeMainWiki: boolean): Promise<void>;
  getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]>;
  linkWiki(mainWikiPath: string, folderName: string, subWikiPath: string): Promise<void>;
  /**
   * Open image or PDF in OS native viewer or some else usage like this.
   * @param homePath Workspace home path, used to locate wiki worker
   * @param title tiddler title to open
   */
  openTiddlerInExternal(homePath: string, title: string): Promise<void>;
  removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink?: boolean): Promise<void>;
  requestOpenTiddlerInWiki(tiddlerName: string): Promise<void>;
  /** send tiddlywiki action message to current active wiki */
  requestWikiSendActionMessage(actionMessage: string): Promise<void>;
  restartWiki(workspace: IWorkspace): Promise<void>;
  setAllWikiStartLockOff(): void;
  setWikiLanguage(view: BrowserView, workspaceID: string, tiddlywikiLanguageName: string): Promise<void>;
  /**
   * Lock to prevent some process ask a wiki to start and restart frequently.
   * For example, start main wiki then start sub-wiki, and sub-wiki will try to start its main wiki. */
  setWikiStartLockOn(wikiFolderLocation: string): void;
  /** call wiki worker to actually start nodejs wiki */
  startWiki(homePath: string, tiddlyWikiPort: number, userName: string): Promise<void>;
  stopAllWiki(): Promise<void>;
  stopWatchAllWiki(): Promise<void>;
  stopWatchWiki(wikiRepoPath: string): Promise<void>;
  stopWiki(homePath: string): Promise<void>;
  updateSubWikiPluginContent(mainWikiPath: string, newConfig?: IWorkspace, oldConfig?: IWorkspace): Promise<void>;
  watchWikiForDebounceCommitAndSync(wikiRepoPath: string, githubRepoUrl: string, userInfo: IGitUserInfos, wikiFolderPath?: string): Promise<void>;
  wikiOperation<OP extends keyof IWikiOperations>(operationType: OP, arguments_: Parameters<IWikiOperations[OP]>): undefined | ReturnType<IWikiOperations[OP]>;
  /** handle start/restart of wiki/subwiki */
  wikiStartup(workspace: IWorkspace): Promise<void>;
}
export const WikiServiceIPCDescriptor = {
  channel: WikiChannel.name,
  properties: {
    checkWikiExist: ProxyPropertyType.Function,
    cloneSubWiki: ProxyPropertyType.Function,
    cloneWiki: ProxyPropertyType.Function,
    copyWikiTemplate: ProxyPropertyType.Function,
    createSubWiki: ProxyPropertyType.Function,
    ensureWikiExist: ProxyPropertyType.Function,
    getSubWikiPluginContent: ProxyPropertyType.Function,
    linkWiki: ProxyPropertyType.Function,
    openTiddlerInExternal: ProxyPropertyType.Function,
    removeWiki: ProxyPropertyType.Function,
    requestOpenTiddlerInWiki: ProxyPropertyType.Function,
    requestWikiSendActionMessage: ProxyPropertyType.Function,
    restartWiki: ProxyPropertyType.Function,
    setWikiLanguage: ProxyPropertyType.Function,
    startWiki: ProxyPropertyType.Function,
    stopAllWiki: ProxyPropertyType.Function,
    stopWatchAllWiki: ProxyPropertyType.Function,
    stopWatchWiki: ProxyPropertyType.Function,
    stopWiki: ProxyPropertyType.Function,
    updateSubWikiPluginContent: ProxyPropertyType.Function,
    watchWikiForDebounceCommitAndSync: ProxyPropertyType.Function,
    wikiOperation: ProxyPropertyType.Function,
    wikiStartup: ProxyPropertyType.Function,
  },
};
