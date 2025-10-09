import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { logger } from '@services/libs/log';
import { parse as bestEffortJsonParser } from 'best-effort-json-parser';
import settings from 'electron-settings';
import fs from 'fs-extra';
import { isWin } from '../../helpers/system';

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
    const error_ = error instanceof Error ? error : new Error(String(error));
    logger.error('Error when checking Setting file format', { function: 'fixEmptyAndErrorSettingFileOnStartUp', error: error_.message, stack: error_.stack ?? '' });
  }
}

export function ensureSettingFolderExist(): void {
  if (!fs.existsSync(SETTINGS_FOLDER)) {
    fs.mkdirSync(SETTINGS_FOLDER, { recursive: true });
  }
}
export function fixSettingFileWhenError(jsonError: Error, providedJSONContent?: string): void {
  logger.error('Setting file format bad: ' + jsonError.message);
  // fix empty content or empty string
  fs.ensureFileSync(settings.file());
  const jsonContent = providedJSONContent || fs.readFileSync(settings.file(), 'utf8').trim() || '{}';
  logger.info('Try to fix JSON content.');
  try {
    const repaired = bestEffortJsonParser(jsonContent) as Record<string, unknown>;
    logger.info('Fix JSON content done, writing it.');
    fs.writeJSONSync(settings.file(), repaired);
    logger.info('Fix JSON content done, saved', { repaired });
  } catch (fixJSONError) {
    const fixError = fixJSONError instanceof Error ? fixJSONError : new Error(String(fixJSONError));
    logger.error('Setting file format bad, and cannot be fixed', { function: 'fixSettingFileWhenError', error: fixError.message, stack: fixError.stack ?? '', jsonContent });
  }
}

try {
  ensureSettingFolderExist();
  settings.configure({
    dir: SETTINGS_FOLDER,
    atomicSave: !isWin,
  });
} catch (error) {
  const error_ = error instanceof Error ? error : new Error(String(error));
  logger.error('Error when configuring settings', { function: 'settings.configure', error: error_.message, stack: error_.stack ?? '' });
}
fixEmptyAndErrorSettingFileOnStartUp();
