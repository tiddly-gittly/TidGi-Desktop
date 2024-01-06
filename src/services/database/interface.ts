import { DatabaseChannel } from '@/constants/channels';
import { IUserInfos } from '@services/auth/interface';
import { IPage } from '@services/pages/interface';
import { IPreferences } from '@services/preferences/interface';
import { IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { DataSource } from 'typeorm';

export interface ISettingFile {
  pages: Record<string, IPage>;
  preferences: IPreferences;
  userInfos: IUserInfos;
  workspaces: Record<string, IWorkspace>;
}

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
  /**
   * Get setting that used by services
   * @param key setting file top level key like `userInfos`
   */
  getSetting<K extends keyof ISettingFile>(key: K): ISettingFile[K] | undefined;
  getWorkspaceDataBasePath(workspaceID: string): string;
  /**
   * Save settings to FS. Due to bugs of electron-settings, you should mostly use `setSetting` instead.
   */
  immediatelyStoreSettingsToFile(): Promise<void>;
  initializeForApp(): Promise<void>;
  /**
   * Create a database file for a workspace, store it in the appData folder, and load it in a worker_thread to execute SQL.   *
   * (not store `.db` file in the workspace wiki's folder, because this cache file shouldn't not by Database committed)
   */
  initializeForWorkspace(workspaceID: string): Promise<void>;
  /**
   * Save setting that used by services to same file, will handle data race.
   * Normally you should use methods on other services instead of this, and they will can this method instead.
   * @param key setting file top level key like `userInfos`
   * @param value whole setting from a service
   */
  setSetting<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]): void;
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
