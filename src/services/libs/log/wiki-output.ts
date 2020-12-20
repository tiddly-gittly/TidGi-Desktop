import path from 'path';
import fs from 'fs-extra';

import { LOG_FOLDER } from '../../constants/paths';

function wikiOutputToFile(wikiName: any, stream: any) {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  stream.pipe(fs.createWriteStream(logFilePath));
}

/**
 * Recreate log file
 * @param {string} wikiName
 */
function refreshOutputFile(wikiName: any) {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  if (fs.existsSync(logFilePath)) {
    fs.removeSync(logFilePath);
  }
  fs.createFileSync(logFilePath);
}

export { wikiOutputToFile, refreshOutputFile };
