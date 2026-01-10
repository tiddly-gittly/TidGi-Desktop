/**
 * Utilities for syncing workspace configuration to/from tidgi.config.json in wiki folder.
 * This allows workspace preferences to be synced across devices via Git.
 *
 * ⚠️ IMPORTANT: When modifying this file, remember to also update:
 * - src/services/workspaces/tidgi.config.schema.json (JSON Schema definition)
 * - syncableConfigFields and syncableConfigDefaultValues in syncableConfig.ts
 *
 * ⚠️ NOTE: This file must NOT import from '../workspaces/interface' or any module that
 * transitively imports 'electron' because it is bundled with Worker code.
 * Import syncable config from '../workspaces/syncableConfig' instead.
 * Logger is injected via initTidgiConfigLogger() to avoid this issue.
 */
import fs from 'fs-extra';
import { isEqual, pickBy } from 'lodash';
import path from 'path';
// CRITICAL: Import from syncableConfig.ts, NOT interface.ts (which imports electron-ipc-cat)
import type { ISyncableWikiConfig, IWikiWorkspaceMinimal, SyncableConfigField } from '../workspaces/syncableConfig';
import { syncableConfigDefaultValues, syncableConfigFields } from '../workspaces/syncableConfig';
// Import JSON repair utilities (jsonRepair.ts also avoids electron imports)
import { parseJsonWithRepair, parseJsonWithRepairSync } from './jsonRepair';

/**
 * The filename for workspace config in wiki folder
 */
export const TIDGI_CONFIG_FILE = 'tidgi.config.json';

/**
 * Schema version for tidgi.config.json
 */
export const TIDGI_CONFIG_VERSION = 1;

/**
 * Interface for the tidgi.config.json file structure
 */
export interface ITidgiConfigFile {
  $schema?: string;
  version: number;
  [key: string]: unknown;
}

/**
 * Logger interface - minimal subset of winston logger
 */
interface ILogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Injected logger instance. Falls back to console if not initialized.
 */
let injectedLogger: ILogger | undefined;

/**
 * Initialize the logger for tidgiConfig module.
 * This should be called early in the main process initialization.
 * @param loggerInstance The logger instance to use (typically from @services/libs/log)
 */
export function initTidgiConfigLogger(loggerInstance: ILogger): void {
  injectedLogger = loggerInstance;
}

/**
 * Get the logger, falling back to console if not initialized
 */
function getLogger(): ILogger {
  if (injectedLogger) {
    return injectedLogger;
  }
  // Fallback to console for cases where logger is not initialized
  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      console.debug(message, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(message, meta);
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      console.error(message, meta);
    },
  };
}

/**
 * Get the path to tidgi.config.json for a wiki
 */
export function getTidgiConfigPath(wikiFolderLocation: string): string {
  return path.join(wikiFolderLocation, TIDGI_CONFIG_FILE);
}

/**
 * Extract syncable config fields from a workspace
 */
export function extractSyncableConfig(workspace: IWikiWorkspaceMinimal): Partial<ISyncableWikiConfig> {
  const syncableConfig: Partial<ISyncableWikiConfig> = {};
  for (const field of syncableConfigFields) {
    if (field in workspace) {
      // Only include non-default values to keep the file minimal
      const value = workspace[field as keyof IWikiWorkspaceMinimal];
      const defaultValue = syncableConfigDefaultValues[field];
      if (!isEqual(value, defaultValue)) {
        (syncableConfig as Record<string, unknown>)[field] = value;
      }
    }
  }
  return syncableConfig;
}

/**
 * Remove syncable config fields from a workspace, leaving only local-only fields
 * This is used when saving to settings.json to avoid data duplication
 */
export function removeSyncableFields(workspace: IWikiWorkspaceMinimal): Partial<IWikiWorkspaceMinimal> {
  const localWorkspace: Partial<IWikiWorkspaceMinimal> = { ...workspace };
  for (const field of syncableConfigFields) {
    delete (localWorkspace as Record<string, unknown>)[field];
  }
  getLogger().debug('Removed syncable fields from workspace', {
    workspaceId: workspace.id,
    removedFields: syncableConfigFields.filter(field => field in workspace),
  });
  return localWorkspace;
}

/**
 * Extract known syncable fields from parsed config
 */
function extractKnownFields(parsed: ITidgiConfigFile): Partial<ISyncableWikiConfig> | undefined {
  // Validate version
  if (typeof parsed.version !== 'number') {
    return undefined;
  }

  const result: Partial<ISyncableWikiConfig> = {};
  for (const field of syncableConfigFields) {
    if (field in parsed && parsed[field] !== undefined) {
      (result as Record<string, unknown>)[field] = parsed[field];
    }
  }
  return result;
}

/**
 * Read syncable config from tidgi.config.json in wiki folder
 * Returns undefined if file doesn't exist or is invalid
 * Uses the same error recovery mechanism as settings.json
 */
export async function readTidgiConfig(wikiFolderLocation: string): Promise<Partial<ISyncableWikiConfig> | undefined> {
  const configPath = getTidgiConfigPath(wikiFolderLocation);
  try {
    if (!await fs.pathExists(configPath)) {
      return undefined;
    }
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = parseJsonWithRepair<ITidgiConfigFile>(content, configPath, { logPrefix: 'tidgi.config.json' });
    if (!parsed) return undefined;

    const result = extractKnownFields(parsed);
    if (!result) {
      getLogger().warn('Invalid tidgi.config.json: missing version', { configPath });
    }
    return result;
  } catch (error) {
    getLogger().warn('Failed to read tidgi.config.json', { configPath, error: (error as Error).message });
    return undefined;
  }
}

/**
 * Read syncable config synchronously
 */
export function readTidgiConfigSync(wikiFolderLocation: string): Partial<ISyncableWikiConfig> | undefined {
  const configPath = getTidgiConfigPath(wikiFolderLocation);
  try {
    if (!fs.pathExistsSync(configPath)) {
      return undefined;
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = parseJsonWithRepairSync<ITidgiConfigFile>(content, configPath, { logPrefix: 'tidgi.config.json' });
    if (!parsed) return undefined;

    return extractKnownFields(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Write syncable config to tidgi.config.json in wiki folder
 * Only writes non-default values to keep the file minimal
 * If all values are default, removes the config file (if it exists)
 */
export async function writeTidgiConfig(wikiFolderLocation: string, config: Partial<ISyncableWikiConfig>): Promise<void> {
  const configPath = getTidgiConfigPath(wikiFolderLocation);
  try {
    // Filter out default values
    const nonDefaultConfig = pickBy(config, (value, key) => {
      const defaultValue = syncableConfigDefaultValues[key as SyncableConfigField];
      return !isEqual(value, defaultValue);
    });

    // If no non-default config, remove the file if it exists
    if (Object.keys(nonDefaultConfig).length === 0) {
      if (await fs.pathExists(configPath)) {
        await fs.remove(configPath);
        getLogger().debug(`Removed tidgi.config.json (all values are default)`, { configPath });
      }
      return;
    }

    const fileContent: ITidgiConfigFile = {
      $schema: 'https://raw.githubusercontent.com/tiddly-gittly/TidGi-Desktop/master/src/services/workspaces/tidgi.config.schema.json',
      version: TIDGI_CONFIG_VERSION,
      ...nonDefaultConfig,
    };

    await fs.writeFile(configPath, JSON.stringify(fileContent, null, 2), 'utf-8');
    getLogger().debug(`[test-id-TIDGI_CONFIG_WRITTEN] Written tidgi.config.json`, { configPath, fields: Object.keys(nonDefaultConfig) });
  } catch (error) {
    getLogger().error('Failed to write tidgi.config.json', { configPath, error: (error as Error).message });
    throw error;
  }
}

/**
 * Merge syncable config from tidgi.config.json over local config
 * Synced config takes precedence over local config
 */
export function mergeWithSyncedConfig<T extends IWikiWorkspaceMinimal>(
  localWorkspace: T,
  syncedConfig: Partial<ISyncableWikiConfig> | undefined,
): T {
  if (!syncedConfig) {
    return localWorkspace;
  }

  // Apply synced config over local, with defaults for missing fields
  const merged = { ...localWorkspace };
  for (const field of syncableConfigFields) {
    if (field in syncedConfig) {
      (merged as Record<string, unknown>)[field] = syncedConfig[field];
    }
  }
  return merged;
}

/**
 * Check if tidgi.config.json exists for a wiki
 */
export async function hasTidgiConfig(wikiFolderLocation: string): Promise<boolean> {
  return fs.pathExists(getTidgiConfigPath(wikiFolderLocation));
}
