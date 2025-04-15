import { DatabaseChannel } from '@/constants/channels';
import type { AgentSettings } from '@services/agent/interface';
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
  agentSettings?: AgentSettings;
}

/**
 * Allow wiki or external app to save/search external non-tiddlywiki store like sqlite (removed) or config file.
 */
export interface IDatabaseService {
  /**
   * Get setting that used by services
   * @param key setting file top level key like `userInfos`
   */
  getSetting<K extends keyof ISettingFile>(key: K): ISettingFile[K] | undefined;
  /**
   * Save settings to FS. Due to bugs of electron-settings, you should mostly use `setSetting` instead.
   */
  immediatelyStoreSettingsToFile(): Promise<void>;
  initializeForApp(): Promise<void>;
  /**
   * Save setting that used by services to same file, will handle data race.
   * Normally you should use methods on other services instead of this, and they will can this method instead.
   * @param key setting file top level key like `userInfos`
   * @param value whole setting from a service
   */
  setSetting<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]): void;
  initializeDatabase(key: string): Promise<void>;
  /**
   * Get a database connection for the app db, which is a sqlite manages by TypeORM for all app level data
   */
  getDatabase(key: string, isRetry?: boolean): Promise<DataSource>;
  closeAppDatabase(key: string, drop?: boolean): void;
}
export const DatabaseServiceIPCDescriptor = {
  channel: DatabaseChannel.name,
  properties: {
    getDataBasePath: ProxyPropertyType.Function,
    initializeForApp: ProxyPropertyType.Function,
    getDatabase: ProxyPropertyType.Function,
    closeAppDatabase: ProxyPropertyType.Function,
  },
};
