/**
 * Syncable workspace configuration constants and types.
 *
 * ⚠️ CRITICAL: This file must NOT import any module that transitively imports 'electron'
 * because it is used by tidgiConfig.ts which is bundled with Worker code.
 *
 * This includes:
 * - Do NOT import from './interface' (it imports electron-ipc-cat)
 * - Do NOT import from '@services/libs/log' (it imports electron)
 * - Do NOT import rxjs, inversify, or other main-process modules
 *
 * Keep this file minimal with only pure TypeScript types and constants.
 */

/**
 * Supported storage services - duplicated here to avoid circular imports
 * Keep in sync with @services/types.ts
 */
export enum SupportedStorageServicesForSync {
  gitee = 'gitee',
  github = 'github',
  gitlab = 'gitlab',
  gitea = 'gitea',
  codeberg = 'codeberg',
  local = 'local',
  solid = 'solid',
  testOAuth = 'testOAuth',
}

/**
 * Fields that should be synced to wiki folder's tidgi.config.json.
 * These are user preferences that should follow the wiki across devices.
 *
 * ⚠️ IMPORTANT: When modifying this list, remember to also update:
 * - src/services/workspaces/tidgi.config.schema.json (JSON Schema definition)
 * - syncableConfigDefaultValues (default values)
 */
export const syncableConfigFields = [
  'name',
  'port',
  'gitUrl',
  'storageService',
  'userName',
  'readOnlyMode',
  'tokenAuth',
  'enableHTTPAPI',
  'enableFileSystemWatch',
  'ignoreSymlinks',
  'backupOnInterval',
  'syncOnInterval',
  'syncOnStartup',
  'disableAudio',
  'disableNotifications',
  'hibernateWhenUnused',
  'transparentBackground',
  'excludedPlugins',
  'tagNames',
  'includeTagTree',
  'fileSystemPathFilterEnable',
  'fileSystemPathFilter',
  'rootTiddler',
  'https',
] as const;

/**
 * Type for syncable config fields
 */
export type SyncableConfigField = typeof syncableConfigFields[number];

/**
 * Default values for syncable config fields (stored in tidgi.config.json)
 *
 * ⚠️ IMPORTANT: When modifying this object, remember to also update:
 * - src/services/workspaces/tidgi.config.schema.json (JSON Schema definition)
 * - syncableConfigFields (field list)
 */
export const syncableConfigDefaultValues = {
  name: '',
  port: 5212,
  gitUrl: null as string | null,
  storageService: SupportedStorageServicesForSync.local as string,
  userName: '',
  readOnlyMode: false,
  tokenAuth: false,
  enableHTTPAPI: false,
  enableFileSystemWatch: false,
  ignoreSymlinks: true,
  backupOnInterval: true,
  syncOnInterval: false,
  syncOnStartup: true,
  disableAudio: false,
  disableNotifications: false,
  hibernateWhenUnused: false,
  transparentBackground: false,
  excludedPlugins: [] as string[],
  tagNames: [] as string[],
  includeTagTree: false,
  fileSystemPathFilterEnable: false,
  fileSystemPathFilter: null as string | null,
  rootTiddler: undefined as string | undefined,
  https: undefined as { enabled: boolean; tlsCert?: string; tlsKey?: string } | undefined,
} as const;

/**
 * Type for syncable config - used by tidgiConfig.ts
 */
export type ISyncableWikiConfig = {
  name: string;
  port: number;
  gitUrl: string | null;
  storageService: string;
  userName: string;
  readOnlyMode: boolean;
  tokenAuth: boolean;
  enableHTTPAPI: boolean;
  enableFileSystemWatch: boolean;
  ignoreSymlinks: boolean;
  backupOnInterval: boolean;
  syncOnInterval: boolean;
  syncOnStartup: boolean;
  disableAudio: boolean;
  disableNotifications: boolean;
  hibernateWhenUnused: boolean;
  transparentBackground: boolean;
  excludedPlugins: string[];
  tagNames: string[];
  includeTagTree: boolean;
  fileSystemPathFilterEnable: boolean;
  fileSystemPathFilter: string | null;
  rootTiddler?: string;
  https?: { enabled: boolean; tlsCert?: string; tlsKey?: string };
};

/**
 * Minimal interface for wiki workspace - only fields needed by tidgiConfig.ts
 * This avoids importing the full IWikiWorkspace from interface.ts
 */
export interface IWikiWorkspaceMinimal extends Partial<ISyncableWikiConfig> {
  id: string;
  wikiFolderLocation: string;
}
