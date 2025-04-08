import { DatabaseChannel } from '@/constants/channels';
import { IUserInfos } from '@services/auth/interface';
import { IPage } from '@services/pages/interface';
import { IPreferences } from '@services/preferences/interface';
import { IWorkspace } from '@services/workspaces/interface';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { AgentSettings } from '@services/agent/interface';

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
}
export const DatabaseServiceIPCDescriptor = {
  channel: DatabaseChannel.name,
  properties: {
    getDataBasePath: ProxyPropertyType.Function,
    initializeForApp: ProxyPropertyType.Function,
  },
};
