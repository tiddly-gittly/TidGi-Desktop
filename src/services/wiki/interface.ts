import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { WikiChannel } from '@/constants/channels';
import { IWorkspace } from '@services/workspaces/interface';
import { IGitUserInfos } from '@services/git/interface';
import type { ISubWikiPluginContent } from './plugin/subWikiPlugin';

export type IWikiMessage = IWikiLogMessage | IWikiControlMessage;
export interface IWikiLogMessage {
  type: 'stdout' | 'stderr';
  message: string;
}
export enum WikiControlActions {
  /** means worker is just started */
  start = 'start',
  /** wiki is booted */
  booted = 'booted',
  error = 'error',
}
export interface IWikiControlMessage {
  type: 'control';
  actions: WikiControlActions;
  message?: string;
}

/**
 * Handle wiki worker startup and restart
 */
export interface IWikiService {
  updateSubWikiPluginContent(mainWikiPath: string, newConfig?: IWorkspace, oldConfig?: IWorkspace): Promise<void>;
  /** call wiki worker to actually start nodejs wiki */
  startWiki(homePath: string, tiddlyWikiPort: number, userName: string): Promise<void>;
  stopWiki(homePath: string): Promise<void>;
  stopAllWiki(): Promise<void>;
  copyWikiTemplate(newFolderPath: string, folderName: string): Promise<void>;
  getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]>;
  /** send tiddlywiki action message to current active wiki */
  requestWikiSendActionMessage(actionMessage: string): Promise<void>;
  requestOpenTiddlerInWiki(tiddlerName: string): Promise<void>;
  linkWiki(mainWikiPath: string, folderName: string, subWikiPath: string): Promise<void>;
  createSubWiki(newFolderPath: string, folderName: string, mainWikiPath: string, tagName?: string, onlyLink?: boolean): Promise<void>;
  removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink?: boolean): Promise<void>;
  ensureWikiExist(wikiPath: string, shouldBeMainWiki: boolean): Promise<void>;
  /** return true if wiki does existed, return error message (a string) if there is an error checking wiki existence */
  checkWikiExist(workspace: IWorkspace, options?: { shouldBeMainWiki?: boolean; showDialog?: boolean }): Promise<string | true>;
  cloneWiki(parentFolderLocation: string, wikiFolderName: string, gitRepoUrl: string, gitUserInfo: IGitUserInfos): Promise<void>;
  cloneSubWiki(
    parentFolderLocation: string,
    wikiFolderName: string,
    mainWikiPath: string,
    gitRepoUrl: string,
    gitUserInfo: IGitUserInfos,
    tagName?: string,
  ): Promise<void>;
  /** handle start/restart of wiki/subwiki */
  wikiStartup(workspace: IWorkspace): Promise<void>;
  watchWikiForDebounceCommitAndSync(wikiRepoPath: string, githubRepoUrl: string, userInfo: IGitUserInfos, wikiFolderPath?: string): Promise<void>;
  stopWatchWiki(wikiRepoPath: string): Promise<void>;
  stopWatchAllWiki(): Promise<void>;
}
export const WikiServiceIPCDescriptor = {
  channel: WikiChannel.name,
  properties: {
    updateSubWikiPluginContent: ProxyPropertyType.Function,
    startWiki: ProxyPropertyType.Function,
    stopWiki: ProxyPropertyType.Function,
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
  },
};
