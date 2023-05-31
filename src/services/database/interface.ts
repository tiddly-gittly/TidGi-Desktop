import { DatabaseChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

/**
 * Allow wiki or external app to save/search tiddlers cache from database like sqlite+sqlite-vss (vector storage)
 */
export interface IDatabaseService {
  getDataBasePath(workspaceID: string): string;
  /**
   * Create a database file for a workspace, store it in the appData folder, and load it in a worker_thread to execute SQL.   *
   * (not store `.db` file in the workspace wiki's folder, because this cache file shouldn't not by Database committed)
   */
  initializeForWorkspace(workspaceID: string): Promise<void>;
}
export const DatabaseServiceIPCDescriptor = {
  channel: DatabaseChannel.name,
  properties: {
    initializeForWorkspace: ProxyPropertyType.Function,
    getDataBasePath: ProxyPropertyType.Function,
  },
};
