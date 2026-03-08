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
}

export const GitServerServiceIPCDescriptor = {
  channel: GitServerChannel.name,
  properties: {
    getWorkspaceRepoPath: ProxyPropertyType.Function,
    gitSmartHTTPInfoRefs$: ProxyPropertyType.Function$,
    gitSmartHTTPUploadPack$: ProxyPropertyType.Function$,
    gitSmartHTTPReceivePack$: ProxyPropertyType.Function$,
    mergeAfterPush: ProxyPropertyType.Function,
  },
};
