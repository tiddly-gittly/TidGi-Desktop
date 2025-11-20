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

export interface IFileDiffResult {
  /** The diff content */
  content: string;
  /** Whether the diff was truncated due to size limits */
  isTruncated: boolean;
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
  type: 'commit' | 'sync' | 'pull' | 'checkout' | 'revert' | 'discard' | 'file-change';
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
   * @param maxLines - Maximum number of lines to return (default: 500)
   * @param maxChars - Maximum number of characters to return (default: 10000)
   */
  getFileDiff(wikiFolderPath: string, commitHash: string, filePath: string, maxLines?: number, maxChars?: number): Promise<IFileDiffResult>;
  /**
   * Get the content of a specific file at a commit
   * @param maxLines - Maximum number of lines to return (default: 500)
   * @param maxChars - Maximum number of characters to return (default: 10000)
   */
  getFileContent(wikiFolderPath: string, commitHash: string, filePath: string, maxLines?: number, maxChars?: number): Promise<IFileDiffResult>;
  /**
   * Get binary file content (e.g., images) from a commit as base64 data URL
   */
  getFileBinaryContent(wikiFolderPath: string, commitHash: string, filePath: string): Promise<string>;
  /**
   * Get image comparison data (previous and current versions) for a file
   */
  getImageComparison(wikiFolderPath: string, commitHash: string, filePath: string): Promise<{ previous: string | null; current: string | null }>;
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
   * Get deleted tiddler titles from git history since a specific date
   * This looks for deleted .tid and .meta files and extracts their title field
   * @param wikiFolderPath - Path to the wiki folder
   * @param sinceDate - Date to check for deletions after this time
   * @returns Array of deleted tiddler titles
   */
  getDeletedTiddlersSinceDate(wikiFolderPath: string, sinceDate: Date): Promise<string[]>;
  /**
   * Get tiddler content at a specific point in time from git history
   * This is used for 3-way merge to get the base version
   * @param wikiFolderPath - Path to the wiki folder
   * @param tiddlerTitle - Title of the tiddler
   * @param beforeDate - Get the version that existed before this date
   * @returns Tiddler fields including text, or null if not found
   */
  getTiddlerAtTime(wikiFolderPath: string, tiddlerTitle: string, beforeDate: Date): Promise<{ fields: Record<string, unknown>; text: string } | null>;
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
    checkoutCommit: ProxyPropertyType.Function,
    clone: ProxyPropertyType.Function,
    commitAndSync: ProxyPropertyType.Function,
    discardFileChanges: ProxyPropertyType.Function,
    forcePull: ProxyPropertyType.Function,
    getCommitFiles: ProxyPropertyType.Function,
    getDeletedTiddlersSinceDate: ProxyPropertyType.Function,
    getFileBinaryContent: ProxyPropertyType.Function,
    getFileContent: ProxyPropertyType.Function,
    getFileDiff: ProxyPropertyType.Function,
    getGitLog: ProxyPropertyType.Function,
    getImageComparison: ProxyPropertyType.Function,
    getModifiedFileList: ProxyPropertyType.Function,
    getTiddlerAtTime: ProxyPropertyType.Function,
    getWorkspacesRemote: ProxyPropertyType.Function,
    gitStateChange$: ProxyPropertyType.Value$,
    initWikiGit: ProxyPropertyType.Function,
    notifyFileChange: ProxyPropertyType.Function,
    revertCommit: ProxyPropertyType.Function,
    syncOrForcePull: ProxyPropertyType.Function,
    isAIGenerateBackupTitleEnabled: ProxyPropertyType.Function,
  },
};
