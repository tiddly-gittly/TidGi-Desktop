/**
 * Represents the author or committer of a commit.
 */
export interface CommitAuthor {
  /**
   * The email address of the author.
   */
  email?: string;
  /**
   * The name of the author.
   */
  name: string;
}

/**
 * File status in git
 */
export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unknown';

/**
 * File with status information
 */
export interface FileWithStatus {
  path: string;
  status: GitFileStatus;
}

/**
 * Represents a single entry in the git log.
 */
export interface GitLogEntry {
  /**
   * The date and time when the commit was originally authored.
   */
  authorDate?: string;
  /**
   * Details of the user who authored the commit.
   */
  author?: CommitAuthor;
  /**
   * The name of the branch this commit belongs to.
   */
  branch: string;
  /**
   * The date and time when the commit was applied by the committer.
   */
  committerDate: string;
  /**
   * The unique hash identifier of the commit.
   */
  hash: string;
  /**
   * The commit message describing the changes made in this commit.
   */
  message: string;
  /**
   * An array of parent commit hashes.
   */
  parents: string[];
  /**
   * Array of files with status changed in this commit.
   */
  files?: FileWithStatus[];
}
