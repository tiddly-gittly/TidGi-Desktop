import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { GitChannel } from '@/constants/channels';
import { ModifiedFileList } from 'git-sync-js';
import type { IWorkspace } from '@services/workspaces/interface';

export interface IGitUserInfos extends IGitUserInfosWithoutToken {
  /** Github Login: token */
  accessToken: string;
}

export interface IGitUserInfosWithoutToken {
  branch: string;
  /** Git commit message email */
  email: string | null | undefined;
  /** Github Login: username , this is also used to filter user's repo when searching repo */
  gitUserName: string;
}

export interface IGitLogMessage {
  level: 'debug' | 'warn' | 'info';
  message: string;
  meta: unknown;
}

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface IGitService {
  clone(remoteUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Promise<void>;
  commitAndSync(wikiFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos): Promise<void>;
  getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]>;
  /** Inspect git's remote url from folder's .git config, return undefined if there is no initialized git */
  getWorkspacesRemote(wikiFolderPath: string): Promise<string | undefined>;
  initWikiGit(wikiFolderPath: string, isSyncedWiki?: false): Promise<void>;
  /**
   * Run git init in a folder, prepare remote origin if isSyncedWiki
   */
  initWikiGit(wikiFolderPath: string, isSyncedWiki: true, isMainWiki: boolean, remoteUrl: string, userInfo: IGitUserInfos): Promise<void>;
  updateGitInfoTiddler(workspace: IWorkspace, githubRepoName: string): Promise<void>;
}
export const GitServiceIPCDescriptor = {
  channel: GitChannel.name,
  properties: {
    updateGitInfoTiddler: ProxyPropertyType.Function,
    getModifiedFileList: ProxyPropertyType.Function,
    initWikiGit: ProxyPropertyType.Function,
    commitAndSync: ProxyPropertyType.Function,
    getWorkspacesRemote: ProxyPropertyType.Function,
    clone: ProxyPropertyType.Function,
  },
};
