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

export type GitLogSearchMode = 'message' | 'file' | 'dateRange' | 'none';

export interface IGitLogOptions {
  page?: number;
  pageSize?: number;
  /** Search query string */
  searchQuery?: string;
  /** Search mode */
  searchMode?: GitLogSearchMode;
  /** File path pattern for file search mode */
  filePath?: string;
  /** Start date for date range search (ISO string) */
  since?: string;
  /** End date for date range search (ISO string) */
  until?: string;
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

export interface IFileDiffResult {
  /** The diff content */
  content: string;
  /** Whether the diff was truncated due to size limits */
  isTruncated: boolean;
}

export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unknown';

export interface IFileWithStatus {
  path: string;
  status: GitFileStatus;
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
  type: 'commit' | 'sync' | 'pull' | 'checkout' | 'revert' | 'undo' | 'discard' | 'file-change';
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
   * Generic type-safe proxy method for git operations
   * Automatically infers parameter types and return types from gitOperations module
   */
  callGitOp<K extends keyof typeof import('./gitOperations')>(
    method: K,
    ...arguments_: Parameters<typeof import('./gitOperations')[K]>
  ): Promise<Awaited<ReturnType<typeof import('./gitOperations')[K]>>>;
  /**
   * Checkout a specific commit
   */
  checkoutCommit(wikiFolderPath: string, commitHash: string): Promise<void>;
  /**
   * Revert a specific commit (using git revert)
   * @param commitMessage - Optional original commit message to include in revert message
   */
  revertCommit(wikiFolderPath: string, commitHash: string, commitMessage?: string): Promise<void>;
  /**
   * Amend latest commit message
   */
  amendCommitMessage(wikiFolderPath: string, newMessage: string): Promise<void>;
  /**
   * Undo a specific commit by resetting to the parent and keeping changes as unstaged
   */
  undoCommit(wikiFolderPath: string, commitHash: string): Promise<void>;
  /**
   * Discard changes for a specific file (restore from HEAD)
   */
  discardFileChanges(wikiFolderPath: string, filePath: string): Promise<void>;
  /**
   * Add a file pattern to .gitignore
   */
  addToGitignore(wikiFolderPath: string, pattern: string): Promise<void>;
  /**
   * Check if AI-generated backup title feature is enabled and configured
   */
  isAIGenerateBackupTitleEnabled(): Promise<boolean>;
  /**
   * Notify that file system changes have been detected
   * This is called by watch-fs plugin to trigger git log refresh
   * @param wikiFolderLocation - The workspace folder where files changed
   * @param options - Notification options
   * @param options.onlyWhenGitLogOpened - Only notify if git log window is open (default: true)
   */
  notifyFileChange(wikiFolderLocation: string, options?: { onlyWhenGitLogOpened?: boolean }): void;
}
export const GitServiceIPCDescriptor = {
  channel: GitChannel.name,
  properties: {
    addToGitignore: ProxyPropertyType.Function,
    callGitOp: ProxyPropertyType.Function,
    checkoutCommit: ProxyPropertyType.Function,
    clone: ProxyPropertyType.Function,
    commitAndSync: ProxyPropertyType.Function,
    discardFileChanges: ProxyPropertyType.Function,
    forcePull: ProxyPropertyType.Function,
    getModifiedFileList: ProxyPropertyType.Function,
    getWorkspacesRemote: ProxyPropertyType.Function,
    gitStateChange$: ProxyPropertyType.Value$,
    initWikiGit: ProxyPropertyType.Function,
    notifyFileChange: ProxyPropertyType.Function,
    revertCommit: ProxyPropertyType.Function,
    amendCommitMessage: ProxyPropertyType.Function,
    undoCommit: ProxyPropertyType.Function,
    syncOrForcePull: ProxyPropertyType.Function,
    isAIGenerateBackupTitleEnabled: ProxyPropertyType.Function,
  },
};
