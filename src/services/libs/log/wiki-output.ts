// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
import path from 'path';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'fs'.
import fs from 'fs-extra';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'LOG_FOLDER... Remove this comment to see the full error message
import { LOG_FOLDER } from '../../constants/paths';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'wikiOutput... Remove this comment to see the full error message
function wikiOutputToFile(wikiName: any, stream: any) {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  stream.pipe(fs.createWriteStream(logFilePath));
}

/**
 * Recreate log file
 * @param {string} wikiName
 */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'refreshOut... Remove this comment to see the full error message
function refreshOutputFile(wikiName: any) {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  if (fs.existsSync(logFilePath)) {
    fs.removeSync(logFilePath);
  }
  fs.createFileSync(logFilePath);
}

export { wikiOutputToFile, refreshOutputFile };
