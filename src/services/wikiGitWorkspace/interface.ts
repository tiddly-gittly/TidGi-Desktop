import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { WikiGitWorkspaceChannel } from '@/constants/channels';
import { IGitUserInfos } from '@services/git/interface';

/**
 * Deal with operations that needs to create a wiki and a git repo at once in a workspace
 */
export interface IWikiGitWorkspaceService {
  /** call git.initWikiGit , and rollback (delete created wiki folder) if it failed */
  initWikiGitTransaction(workspaceID: string, wikiFolderPath: string, isMainWiki: false, isSyncedWiki: false, mainWikiToUnLink: string): Promise<void>;
  initWikiGitTransaction(
    workspaceID: string,
    wikiFolderPath: string,
    isMainWiki: false,
    isSyncedWiki: true,
    githubRepoUrl: string,
    userInfo: IGitUserInfos,
    mainWikiToUnLink: string,
  ): Promise<void>;
  initWikiGitTransaction(workspaceID: string, wikiFolderPath: string, isMainWiki: true, isSyncedWiki: false): Promise<void>;
  initWikiGitTransaction(
    workspaceID: string,
    wikiFolderPath: string,
    isMainWiki: true,
    isSyncedWiki: true,
    githubRepoUrl: string,
    userInfo: IGitUserInfos,
  ): Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
}
export const WikiGitWorkspaceServiceIPCDescriptor = {
  channel: WikiGitWorkspaceChannel.name,
  properties: {
    initWikiGitTransaction: ProxyPropertyType.Function,
    removeWorkspace: ProxyPropertyType.Function,
  },
};
