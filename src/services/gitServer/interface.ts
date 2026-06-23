import { GitServerChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

/**
 * A chunk of Git Smart HTTP response transported via IPC Observable.
 * First emission carries headers, subsequent ones carry data.
 */
export type GitHTTPResponseChunk =
  | { type: 'headers'; statusCode: number; headers: Record<string, string> }
  | { type: 'data'; data: Uint8Array };

/**
 * Generic git primitives exposed by TidGi Desktop to TiddlyWiki plugins.
 *
 * The mobile-sync-specific algorithms (Smart HTTP, archive generation,
 * merge-incoming) have moved to the tw-mobile-sync plugin so they can run
 * standalone in a TiddlyWiki Node.js instance. Desktop keeps only the
 * low-level dugite-backed primitives for plugins that opt-in to delegate
 * git execution to the desktop process.
 */
export interface IGitServerService {
  /**
   * Get workspace repository path
   * @param workspaceId workspace ID
   * @returns wikiFolderLocation (git repo path) or undefined if not found
   */
  getWorkspaceRepoPath(workspaceId: string): Promise<string | undefined>;

  /**
   * Read a file from the workspace working tree (relative to repo root).
   * @param workspaceId workspace ID
   * @param relativePath path relative to repo root (e.g. 'tiddlers/MyTiddler.tid')
   * @returns file content as UTF-8 string, or undefined if file not found
   */
  readWorkspaceFile(workspaceId: string, relativePath: string): Promise<string | undefined>;

  /**
   * Write a file to the workspace working tree (relative to repo root).
   * @param workspaceId workspace ID
   * @param relativePath path relative to repo root (e.g. 'tiddlers/MyTiddler.tid')
   * @param content file content as UTF-8 string
   */
  writeWorkspaceFile(workspaceId: string, relativePath: string, content: string): Promise<void>;

  /**
   * Run a git command in the specified workspace repository using dugite.
   * @param workspaceId workspace ID
   * @param gitArguments git command arguments
   * @param environment optional environment variables to merge with process.env for the git process
   * @returns { exitCode, stdout, stderr }
   */
  runGitCommand(workspaceId: string, gitArguments: string[], environment?: Record<string, string>): Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

  /**
   * Write a temporary file to the workspace's .git directory.
   * @param workspaceId workspace ID
   * @param fileName file name (will be placed inside .git/)
   * @param data file content as Uint8Array
   * @returns full path to the written file
   */
  writeTempGitFile(workspaceId: string, fileName: string, data: Uint8Array): Promise<string>;

  /**
   * Delete a file from the workspace's .git directory.
   * @param workspaceId workspace ID
   * @param fileName file name inside .git/
   */
  deleteTempGitFile(workspaceId: string, fileName: string): Promise<void>;
}

export const GitServerServiceIPCDescriptor = {
  channel: GitServerChannel.name,
  properties: {
    getWorkspaceRepoPath: ProxyPropertyType.Function,
    readWorkspaceFile: ProxyPropertyType.Function,
    writeWorkspaceFile: ProxyPropertyType.Function,
    runGitCommand: ProxyPropertyType.Function,
    writeTempGitFile: ProxyPropertyType.Function,
    deleteTempGitFile: ProxyPropertyType.Function,
  },
};
