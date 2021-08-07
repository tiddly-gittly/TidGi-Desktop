import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
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
  removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink?: boolean): Promise<void>;
  requestOpenTiddlerInWiki(tiddlerName: string): Promise<void>;
  /** send tiddlywiki action message to current active wiki */
  requestWikiSendActionMessage(actionMessage: string): Promise<void>;
  restartWiki(workspace: IWorkspace): Promise<void>;
  setAllWikiStartLockOff(): void;
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
    updateSubWikiPluginContent: ProxyPropertyType.Function,
    startWiki: ProxyPropertyType.Function,
    stopWiki: ProxyPropertyType.Function,
    restartWiki: ProxyPropertyType.Function,
    stopAllWiki: ProxyPropertyType.Function,
    copyWikiTemplate: ProxyPropertyType.Function,
    getSubWikiPluginContent: ProxyPropertyType.Function,
    requestWikiSendActionMessage: ProxyPropertyType.Function,
    requestOpenTiddlerInWiki: ProxyPropertyType.Function,
    linkWiki: ProxyPropertyType.Function,
    createSubWiki: ProxyPropertyType.Function,
    removeWiki: ProxyPropertyType.Function,
    ensureWikiExist: ProxyPropertyType.Function,
    checkWikiExist: ProxyPropertyType.Function,
    cloneWiki: ProxyPropertyType.Function,
    cloneSubWiki: ProxyPropertyType.Function,
    wikiStartup: ProxyPropertyType.Function,
    watchWikiForDebounceCommitAndSync: ProxyPropertyType.Function,
    stopWatchWiki: ProxyPropertyType.Function,
    stopWatchAllWiki: ProxyPropertyType.Function,
    wikiOperation: ProxyPropertyType.Function,
  },
};
