import { GitChannel } from '@/constants/channels';
import type { IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { ICommitAndSyncOptions, ModifiedFileList } from 'git-sync-js';

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

export type IGitLogMessage = INormalGitLogMessage | IErrorGitLogMessage;
export interface INormalGitLogMessage {
  level: 'debug' | 'warn' | 'info';
  message: string;
  meta: unknown;
}
export interface IErrorGitLogMessage {
  error: Error;
  level: 'error';
}

export type ICommitAndSyncConfigs = ICommitAndSyncOptions;

export interface IForcePullConfigs {
  remoteUrl?: string;
  userInfo?: IGitUserInfos;
}

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface IGitService {
  initialize(): Promise<void>;
  clone(remoteUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Promise<void>;
  /**
   * Return true if this function's execution causes local changes. Return false if is only push or nothing changed.
   */
  commitAndSync(workspace: IWorkspace, configs: ICommitAndSyncConfigs): Promise<boolean>;
  /**
   * Ignore all local changes, force reset local to remote.
   */
  forcePull(workspace: IWorkspace, configs: IForcePullConfigs): Promise<boolean>;
  getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]>;
  /** Inspect git's remote url from folder's .git config, return undefined if there is no initialized git */
  getWorkspacesRemote(wikiFolderPath?: string): Promise<string | undefined>;
  /**
   * Run git init in a folder, prepare remote origin if isSyncedWiki
   */
  initWikiGit(wikiFolderPath: string, isSyncedWiki: true, isMainWiki: boolean, remoteUrl: string, userInfo: IGitUserInfos): Promise<void>;
  initWikiGit(wikiFolderPath: string, isSyncedWiki?: false): Promise<void>;
  /**
   * Decide to use forcePull or commitAndSync according to workspace's `readOnlyMode` setting.
   *
   * This does not handle `commitOnly` option, if it is not readonly. You need to use `commitAndSync` directly.
   */
  syncOrForcePull(workspace: IWorkspace, configs: IForcePullConfigs & ICommitAndSyncConfigs): Promise<boolean>;
}
export const GitServiceIPCDescriptor = {
  channel: GitChannel.name,
  properties: {
    clone: ProxyPropertyType.Function,
    commitAndSync: ProxyPropertyType.Function,
    forcePull: ProxyPropertyType.Function,
    getModifiedFileList: ProxyPropertyType.Function,
    getWorkspacesRemote: ProxyPropertyType.Function,
    initWikiGit: ProxyPropertyType.Function,
    syncOrForcePull: ProxyPropertyType.Function,
  },
};
