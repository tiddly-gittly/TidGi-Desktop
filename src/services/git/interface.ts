import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { IUserInfo } from '@services/types';
import { GitChannel } from '@/constants/channels';
import { ModifiedFileList } from './inspect';

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface IGitService {
  debounceCommitAndSync: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo) => Promise<void> | undefined;
  updateGitInfoTiddler(githubRepoName: string): Promise<void>;
  getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]>;
  initWikiGit(wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo, isMainWiki: boolean): Promise<void>;
  commitAndSync(wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo): Promise<void>;
  getWorkspacesRemote(wikiFolderPath: string): Promise<string>;
  clone(githubRepoUrl: string, repoFolderPath: string, userInfo: IUserInfo): Promise<void>;
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
