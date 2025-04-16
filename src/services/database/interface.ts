import { DatabaseChannel } from '@/constants/channels';
import type { AgentSettings } from '@services/agent/interface';
import { IUserInfos } from '@services/auth/interface';
import { AISettings } from '@services/externalAPI/interface';
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
  aiSettings?: AISettings;
}

/**
 * Allow wiki or external app to save/search external non-tiddlywiki store like sqlite (removed) or config file.
 */
export interface IDatabaseService {
  /**
   * Get setting from configuration
   */
  getSetting<K extends keyof ISettingFile>(key: K): ISettingFile[K] | undefined;

  /**
   * Save settings to FS. Due to bugs of electron-settings, you should mostly use `setSetting` instead.
   */
  immediatelyStoreSettingsToFile(): Promise<void>;

  /**
   * Initialize database and settings for application
   */
  initializeForApp(): Promise<void>;

  /**
   * Save setting that used by services to same file, will handle data race.
   * Normally you should use methods on other services instead of this, and they will can this method instead.
   * @param key setting file top level key like `userInfos`
   * @param value whole setting from a service
   */
  setSetting<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]): void;

  /**
   * Initialize database for specific key
   */
  initializeDatabase(key: string): Promise<void>;

  /**
   * Get database connection for specific key
   */
  getDatabase(key: string, isRetry?: boolean): Promise<DataSource>;

  /**
   * Close database connection
   */
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
