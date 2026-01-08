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

  if (repaired) {
    fs.writeJSONSync(settings.file(), repaired);
    logger.info('Fix JSON content done, saved', { repaired });
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
        fs.readJsonSync(settings.file());
        logger.info('Setting file format good.');
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
