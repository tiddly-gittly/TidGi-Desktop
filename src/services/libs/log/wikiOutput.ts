import fs from 'fs-extra';
import path from 'path';

import { LOG_FOLDER } from '@/constants/appPaths';

export function getWikiLogFilePath(wikiName: string): string {
  const logFileName = wikiName.replaceAll(/["*/:<>?\\|]/g, '_');
  const logFilePath = path.join(LOG_FOLDER, `${logFileName}.log`);
  return logFilePath;
}
export function wikiOutputToFile(wikiName: string, message: string): void {
  fs.appendFileSync(getWikiLogFilePath(wikiName), message);
}

/**
 * Recreate log file
 * @param {string} wikiName
 */
export function refreshOutputFile(wikiName: string): void {
  const logFilePath = getWikiLogFilePath(wikiName);
  if (fs.existsSync(logFilePath)) {
    fs.removeSync(logFilePath);
  }
  fs.createFileSync(logFilePath);
}
