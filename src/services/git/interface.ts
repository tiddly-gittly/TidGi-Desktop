import { GitChannel } from '@/constants/channels';
import type { IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { ICommitAndSyncOptions, ModifiedFileList } from 'git-sync-js';
import type { BehaviorSubject } from 'rxjs';

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

export interface IGitLogOptions {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
}

export interface IGitLogResult {
  entries: Array<{
    hash: string;
    parents: string[];
    branch: string;
    message: string;
    committerDate: string;
    author?: {
      name: string;
      email?: string;
    };
    authorDate?: string;
  }>;
  currentBranch: string;
  totalCount: number;
}

/**
 * Git state change event
 */
export interface IGitStateChange {
  /** Timestamp of the change */
  timestamp: number;
  /** The workspace folder that changed */
  wikiFolderLocation: string;
  /** Type of change */
  type: 'commit' | 'sync' | 'pull' | 'checkout' | 'revert';
}

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface IGitService {
  /**
   * Observable that emits when git state changes (commit, sync, etc.)
   */
  gitStateChange$: BehaviorSubject<IGitStateChange | undefined>;
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
  /**
   * Get git log entries with pagination support
   */
  getGitLog(wikiFolderPath: string, options?: IGitLogOptions): Promise<IGitLogResult>;
  /**
   * Get files changed in a specific commit
   */
  getCommitFiles(wikiFolderPath: string, commitHash: string): Promise<string[]>;
  /**
   * Get the diff for a specific file in a commit
   */
  getFileDiff(wikiFolderPath: string, commitHash: string, filePath: string): Promise<string>;
  /**
   * Checkout a specific commit
   */
  checkoutCommit(wikiFolderPath: string, commitHash: string): Promise<void>;
  /**
   * Revert a specific commit
   */
  revertCommit(wikiFolderPath: string, commitHash: string): Promise<void>;
}
export const GitServiceIPCDescriptor = {
  channel: GitChannel.name,
  properties: {
    checkoutCommit: ProxyPropertyType.Function,
    clone: ProxyPropertyType.Function,
    commitAndSync: ProxyPropertyType.Function,
    forcePull: ProxyPropertyType.Function,
    getCommitFiles: ProxyPropertyType.Function,
    getFileDiff: ProxyPropertyType.Function,
    getGitLog: ProxyPropertyType.Function,
    getModifiedFileList: ProxyPropertyType.Function,
    getWorkspacesRemote: ProxyPropertyType.Function,
    gitStateChange$: ProxyPropertyType.Value$,
    initWikiGit: ProxyPropertyType.Function,
    revertCommit: ProxyPropertyType.Function,
    syncOrForcePull: ProxyPropertyType.Function,
  },
};
