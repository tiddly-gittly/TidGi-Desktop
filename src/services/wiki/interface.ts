import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { WikiChannel } from '@/constants/channels';
import { IWorkspace } from '@services/workspaces/interface';
import { IGitUserInfos } from '@services/git/interface';
import type { ISubWikiPluginContent } from './update-plugin-content';

/**
 * Handle wiki worker startup and restart
 */
export interface IWikiService {
  updateSubWikiPluginContent(mainWikiPath: string, newConfig?: IWorkspace, oldConfig?: IWorkspace): void;
  startWiki(homePath: string, tiddlyWikiPort: number, userName: string): Promise<void>;
  stopWiki(homePath: string): Promise<void>;
  stopAllWiki(): Promise<void>;
  copyWikiTemplate(newFolderPath: string, folderName: string): Promise<string>;
  getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]>;
  requestWikiSendActionMessage(actionMessage: string): void;
  requestOpenTiddlerInWiki(tiddlerName: string): void;
  linkWiki(mainWikiPath: string, folderName: string, subWikiPath: string): Promise<void>;
  createWiki(newFolderPath: string, folderName: string): Promise<void>;
  createSubWiki(newFolderPath: string, folderName: string, mainWikiPath: string, tagName?: string, onlyLink?: boolean): Promise<void>;
  removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink?: boolean): Promise<void>;
  ensureWikiExist(wikiPath: string, shouldBeMainWiki: boolean): Promise<void>;
  cloneWiki(parentFolderLocation: string, wikiFolderName: string, gitRepoUrl: string, gitUserInfo: IGitUserInfos): Promise<void>;
  cloneSubWiki(
    parentFolderLocation: string,
    wikiFolderName: string,
    mainWikiPath: string,
    gitRepoUrl: string,
    gitUserInfo: IGitUserInfos,
    tagName?: string,
  ): Promise<void>;
  wikiStartup(workspace: IWorkspace): Promise<void>;
  startNodeJSWiki(homePath: string, port: number, userName: string, workspaceID: string): Promise<void>;
  watchWiki(wikiRepoPath: string, githubRepoUrl: string, userInfo: IGitUserInfos, wikiFolderPath?: string): Promise<void>;
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
    createWiki: ProxyPropertyType.Function,
    createSubWiki: ProxyPropertyType.Function,
    removeWiki: ProxyPropertyType.Function,
    ensureWikiExist: ProxyPropertyType.Function,
    cloneWiki: ProxyPropertyType.Function,
    cloneSubWiki: ProxyPropertyType.Function,
    wikiStartup: ProxyPropertyType.Function,
    startNodeJSWiki: ProxyPropertyType.Function,
    watchWiki: ProxyPropertyType.Function,
    stopWatchWiki: ProxyPropertyType.Function,
    stopWatchAllWiki: ProxyPropertyType.Function,
  },
};
