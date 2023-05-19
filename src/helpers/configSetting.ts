import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { logger } from '@services/libs/log';
import { parse as bestEffortJsonParser } from 'best-effort-json-parser';
import settings from 'electron-settings';
import fs from 'fs-extra';
import { isWin } from './system';

export function fixSettingFileWhenError(jsonError: Error): void {
  logger.error('Setting file format bad: ' + jsonError.message);
  // fix empty content or empty string
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  const jsonContent = fs.readFileSync(settings.file(), 'utf8').trim() || '{}';
  logger.info('Try to fix JSON content.');
  try {
    const repaired = bestEffortJsonParser(jsonContent) as Record<string, unknown>;
    logger.info('Fix JSON content done, writing it.');
    fs.writeJSONSync(settings.file(), repaired);
    logger.info('Fix JSON content done, saved', { repaired });
  } catch (fixJSONError) {
    logger.error('Setting file format bad, and cannot be fixed: ' + (fixJSONError as Error).message, { jsonContent });
  }
}

settings.configure({
  dir: SETTINGS_FOLDER,
  atomicSave: !isWin,
});
// Fix sometimes JSON is malformed https://github.com/nathanbuchar/electron-settings/issues/160
if (fs.existsSync(settings.file())) {
  try {
    logger.info('Checking Setting file format.');
    fs.readJsonSync(settings.file());
    logger.info('Setting file format good.');
  } catch (jsonError) {
    fixSettingFileWhenError(jsonError as Error);
  }
}
