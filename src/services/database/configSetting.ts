/**
 * Configuration and settings utilities - re-exports from specialized modules.
 *
 * This module re-exports from:
 * - settingsInit.ts: settings.json initialization and error recovery
 * - tidgiConfig.ts: tidgi.config.json workspace config sync
 * - jsonRepair.ts: JSON parsing and repair utilities
 */

// Settings initialization utilities
export { ensureSettingFolderExist, fixSettingFileWhenError } from './settingsInit';

// JSON repair utilities
export { initJsonRepairLogger } from './jsonRepair';

// TidGi workspace config sync utilities
export {
  extractSyncableConfig,
  getTidgiConfigPath,
  hasTidgiConfig,
  initTidgiConfigLogger,
  mergeWithSyncedConfig,
  readTidgiConfig,
  readTidgiConfigSync,
  removeSyncableFields,
  TIDGI_CONFIG_FILE,
  TIDGI_CONFIG_VERSION,
  writeTidgiConfig,
} from './tidgiConfig';
export type { ITidgiConfigFile } from './tidgiConfig';
