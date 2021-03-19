import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { GitChannel } from '@/constants/channels';
import { ModifiedFileList } from './inspect';

export interface IGitUserInfos {
  /** Git commit message email */
  email: string;
  /** Github Login: token */
  accessToken: string;
  /** Github Login: username , this is also used to filter user's repo when searching repo */
  gitUserName: string;
}

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface IGitService {
  /**
   * Call commitAndSync every period of time. This cannot be used as promise, as said in https://github.com/lodash/lodash/issues/4700
   */
  debounceCommitAndSync: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IGitUserInfos) => Promise<void> | undefined;
  updateGitInfoTiddler(githubRepoName: string): Promise<void>;
  getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]>;
  initWikiGit(wikiFolderPath: string, githubRepoUrl: string, userInfo: IGitUserInfos, isMainWiki: boolean): Promise<void>;
  commitAndSync(wikiFolderPath: string, githubRepoUrl: string, userInfo: IGitUserInfos): Promise<void>;
  getWorkspacesRemote(wikiFolderPath: string): Promise<string>;
  clone(githubRepoUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Promise<void>;
}
export const GitServiceIPCDescriptor = {
  channel: GitChannel.name,
  properties: {
    debounceCommitAndSync: ProxyPropertyType.Function,
    updateGitInfoTiddler: ProxyPropertyType.Function,
    getModifiedFileList: ProxyPropertyType.Function,
    initWikiGit: ProxyPropertyType.Function,
    commitAndSync: ProxyPropertyType.Function,
    getWorkspacesRemote: ProxyPropertyType.Function,
    clone: ProxyPropertyType.Function,
  },
};
