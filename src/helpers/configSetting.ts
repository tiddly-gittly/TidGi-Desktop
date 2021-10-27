import fs from 'fs-extra';
import settings from 'electron-settings';
import bestEffortJsonParser from 'best-effort-json-parser';
import { SETTINGS_FOLDER } from '@/constants/appPaths';
import { logger } from '@services/libs/log';

settings.configure({
  dir: SETTINGS_FOLDER,
  atomicSave: process.platform !== 'win32',
});
// Fix sometimes JSON is malformed https://github.com/nathanbuchar/electron-settings/issues/160
if (fs.existsSync(settings.file())) {
  try {
    logger.info('Checking Setting file format.');
    fs.readJsonSync(settings.file());
    logger.info('Setting file format good.');
  } catch (jsonError) {
    logger.error('Setting file format bad: ' + (jsonError as Error).message);
    const jsonContent = fs.readFileSync(settings.file(), 'utf-8');
    logger.info('Try to fix JSON content.');
    try {
      const repaired = bestEffortJsonParser.parse(jsonContent) as Record<string, unknown>;
      logger.info('Fix JSON content done, writing it.');
      fs.writeJSONSync(settings.file(), repaired);
      logger.info('Fix JSON content done, saved', { repaired });
    } catch (fixJSONError) {
      logger.error('Setting file format bad, and cannot be fixed: ' + (fixJSONError as Error).message, { jsonContent });
    }
  }
}
