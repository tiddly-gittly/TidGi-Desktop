import path from 'path';
import fs from 'fs-extra';

import { LOG_FOLDER } from '../../constants/paths';

export function wikiOutputToFile(wikiName: string, stream: NodeJS.ReadableStream): void {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  stream.pipe(fs.createWriteStream(logFilePath));
}

/**
 * Recreate log file
 * @param {string} wikiName
 */
export function refreshOutputFile(wikiName: string): void {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  if (fs.existsSync(logFilePath)) {
    fs.removeSync(logFilePath);
  }
  fs.createFileSync(logFilePath);
}
