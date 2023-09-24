import { DatabaseChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { DataSource } from 'typeorm';

/**
 * Allow wiki or external app to save/search tiddlers cache from database like sqlite+sqlite-vss (vector storage)
 */
export interface IDatabaseService {
  closeAppDatabase(drop?: boolean): void;
  getAppDataBasePath(): string;
  /**
   * Get a database connection for the app db, which is a sqlite manages by TypeORM for all app level data
   */
  getAppDatabase(isRetry?: boolean): Promise<DataSource>;
  getWorkspaceDataBasePath(workspaceID: string): string;
  initializeForApp(): Promise<void>;
  /**
   * Create a database file for a workspace, store it in the appData folder, and load it in a worker_thread to execute SQL.   *
   * (not store `.db` file in the workspace wiki's folder, because this cache file shouldn't not by Database committed)
   */
  initializeForWorkspace(workspaceID: string): Promise<void>;
}
export const DatabaseServiceIPCDescriptor = {
  channel: DatabaseChannel.name,
  properties: {
    getAppDataBasePath: ProxyPropertyType.Function,
    getDataBasePath: ProxyPropertyType.Function,
    initializeForApp: ProxyPropertyType.Function,
    initializeForWorkspace: ProxyPropertyType.Function,
  },
};
