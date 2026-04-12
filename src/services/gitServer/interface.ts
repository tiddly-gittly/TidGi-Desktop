import { GitServerChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';

/**
 * A chunk of Git Smart HTTP response transported via IPC Observable.
 * First emission carries headers, subsequent ones carry data.
 */
export type GitHTTPResponseChunk =
  | { type: 'headers'; statusCode: number; headers: Record<string, string> }
  | { type: 'data'; data: Uint8Array };

/**
 * Git Smart HTTP Server Service
 * Provides Git Smart HTTP endpoints for mobile clients to sync with desktop repos
 */
export interface IGitServerService {
  /**
   * Get workspace repository path
   * @param workspaceId workspace ID
   * @returns wikiFolderLocation (git repo path) or undefined if not found
   */
  getWorkspaceRepoPath(workspaceId: string): Promise<string | undefined>;

  /**
   * Git Smart HTTP info/refs — returns Observable that streams response chunks via IPC.
   * First emission is headers, subsequent ones are data chunks.
   */
  gitSmartHTTPInfoRefs$(workspaceId: string, service: string): Observable<GitHTTPResponseChunk>;

  /**
   * Git Smart HTTP upload-pack (fetch/pull).
   * @param requestBody collected POST body from client (Uint8Array is structured-clone safe)
   */
  gitSmartHTTPUploadPack$(workspaceId: string, requestBody: Uint8Array): Observable<GitHTTPResponseChunk>;

  /**
   * Git Smart HTTP receive-pack (push).
   * @param requestBody collected POST body from client
   */
  gitSmartHTTPReceivePack$(workspaceId: string, requestBody: Uint8Array): Observable<GitHTTPResponseChunk>;

  /**
   * After receive-pack completes, merge mobile-incoming branch into main.
   * Resolves .tid conflicts (metadata from mobile, body merged).
   */
  mergeAfterPush(workspaceId: string): Promise<void>;

  /**
   * Receive a git bundle from mobile and fetch its contents into mobile-incoming branch.
   * Alternative to receive-pack that avoids JGit's HTTP push protocol issues.
   * @param bundleData raw git bundle bytes
   */
  receiveBundleAndFetch(workspaceId: string, bundleData: Uint8Array): Promise<void>;

  /**
   * Generate a tar archive of the complete workspace (working tree + minimal .git).
   * Used by mobile for fast clone: download tar → extract natively.
   * Returns archive path, HEAD commit hash, and file size.
   * Returns undefined if workspace not found.
   */
  generateFullArchive(workspaceId: string): Promise<{ archivePath: string; commitHash: string; sizeBytes: number } | undefined>;

  /**
   * Run a git command in the specified workspace repository using dugite.
   * Exposed so TiddlyWiki plugins can run arbitrary git commands without
   * needing TidGi Desktop code changes.
   * @param workspaceId workspace ID
   * @param args git command arguments (e.g. ['fetch', 'bundle.file', 'master:mobile-incoming'])
   * @returns { exitCode, stdout, stderr }
   */
  runGitCommand(workspaceId: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

  /**
   * Write a temporary file to the workspace's .git directory.
   * Used by plugins that need to write temp files (e.g. git bundles) before running git commands.
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
    gitSmartHTTPInfoRefs$: ProxyPropertyType.Function$,
    gitSmartHTTPUploadPack$: ProxyPropertyType.Function$,
    gitSmartHTTPReceivePack$: ProxyPropertyType.Function$,
    mergeAfterPush: ProxyPropertyType.Function,
    receiveBundleAndFetch: ProxyPropertyType.Function,
    generateFullArchive: ProxyPropertyType.Function,
    runGitCommand: ProxyPropertyType.Function,
    writeTempGitFile: ProxyPropertyType.Function,
    deleteTempGitFile: ProxyPropertyType.Function,
  },
};
