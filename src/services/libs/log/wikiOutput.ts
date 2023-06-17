import fs from 'fs-extra';
import path from 'path';

import { LOG_FOLDER } from '@/constants/appPaths';
import { logger } from '.';

export function getWikiLogFilePath(wikiName: string): string {
  const logFileName = wikiName.replaceAll(/["*/:<>?\\|]/g, '_');
  const logFilePath = path.join(LOG_FOLDER, `${logFileName}.log`);
  return logFilePath;
}
export async function wikiOutputToFile(wikiName: string, message: string) {
  try {
    await fs.appendFile(getWikiLogFilePath(wikiName), message);
  } catch (error) {
    logger.error(`${getWikiLogFilePath(wikiName)}: ${(error as Error).message})}`, { function: 'wikiOutputToFile' });
  }
}

/**
 * Recreate log file
 * @param {string} wikiName
 */
export async function refreshOutputFile(wikiName: string) {
  try {
    const logFilePath = getWikiLogFilePath(wikiName);
    if (await fs.exists(logFilePath)) {
      await fs.remove(logFilePath);
    }
    await fs.createFile(logFilePath);
  } catch (error) {
    logger.error(`${getWikiLogFilePath(wikiName)}: ${(error as Error).message})}`, { function: 'refreshOutputFile' });
  }
}
