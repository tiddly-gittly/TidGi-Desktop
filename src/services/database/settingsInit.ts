/**
 * Settings file initialization and error recovery utilities.
 * This module handles settings.json initialization, validation, and repair.
 */
import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { logger } from '@services/libs/log';
import settings from 'electron-settings';
import fs from 'fs-extra';
import { isWin } from '../../helpers/system';
import { parseJsonWithRepairSync } from './jsonRepair';

/**
 * Ensure the settings folder exists
 */
export function ensureSettingFolderExist(): void {
  if (!fs.existsSync(SETTINGS_FOLDER)) {
    fs.mkdirSync(SETTINGS_FOLDER, { recursive: true });
  }
}

/**
 * Fix a malformed settings.json file using best-effort JSON parser
 */
export function fixSettingFileWhenError(jsonError: Error, providedJSONContent?: string): void {
  logger.error('Setting file format bad: ' + jsonError.message);
  // fix empty content or empty string
  fs.ensureFileSync(settings.file());
  const jsonContent = providedJSONContent || fs.readFileSync(settings.file(), 'utf8').trim() || '{}';
  logger.info('Try to fix JSON content.');

  const repaired = parseJsonWithRepairSync<Record<string, unknown>>(
    jsonContent,
    settings.file(),
    { logPrefix: 'settings.json', writeBack: false },
  );

  // Only write back if the repaired result is a plain object; a non-object (e.g. a string returned by
  // best-effort-json-parser for bare-string content) would corrupt the file again.
  if (repaired !== null && typeof repaired === 'object' && !Array.isArray(repaired)) {
    fs.writeJSONSync(settings.file(), repaired);
    logger.info('Fix JSON content done, saved', { repaired });
  } else if (repaired !== undefined) {
    logger.warn('fixSettingFileWhenError: repaired value is not a plain object, resetting settings to {}', { type: typeof repaired });
    fs.writeJSONSync(settings.file(), {});
  }
}

/**
 * Check and fix settings.json format on startup
 */
function fixEmptyAndErrorSettingFileOnStartUp() {
  try {
    // Fix sometimes JSON is malformed https://github.com/nathanbuchar/electron-settings/issues/160
    if (fs.existsSync(settings.file())) {
      try {
        logger.info('Checking Setting file format.');
        const content = fs.readJsonSync(settings.file()) as unknown;
        // A valid JSON string at the root (e.g. `"wiki"`) passes JSON.parse but breaks property assignment.
        if (content === null || typeof content !== 'object' || Array.isArray(content)) {
          logger.warn('Settings file has non-object root value, resetting to {}');
          fs.writeJSONSync(settings.file(), {});
        } else {
          logger.info('Setting file format good.');
        }
      } catch (jsonError) {
        fixSettingFileWhenError(jsonError as Error);
      }
    } else {
      // create an empty JSON file if not exist, to prevent error when reading it. fixes https://github.com/tiddly-gittly/TidGi-Desktop/issues/507
      fs.ensureFileSync(settings.file());
      fs.writeJSONSync(settings.file(), {});
    }
  } catch (error) {
    logger.error('Error when checking Setting file format', { function: 'fixEmptyAndErrorSettingFileOnStartUp', error });
  }
}

/**
 * Initialize settings on module load
 */
export function initializeSettings(): void {
  try {
    ensureSettingFolderExist();
    settings.configure({
      dir: SETTINGS_FOLDER,
      atomicSave: !isWin,
    });
  } catch (error) {
    logger.error('Error when configuring settings', { function: 'settings.configure', error });
  }
  fixEmptyAndErrorSettingFileOnStartUp();
}

// Auto-initialize on module load
initializeSettings();
