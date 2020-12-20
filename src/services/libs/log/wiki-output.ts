const path = require('path');
const fs = require('fs-extra');

const { LOG_FOLDER } = require('../../constants/paths');

function wikiOutputToFile(wikiName, stream) {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  stream.pipe(fs.createWriteStream(logFilePath));
}

/**
 * Recreate log file
 * @param {string} wikiName 
 */
function refreshOutputFile(wikiName) {
  const logFilePath = path.join(LOG_FOLDER, `${wikiName}.log`);
  if (fs.existsSync(logFilePath)) {
    fs.removeSync(logFilePath);
  }
  fs.createFileSync(logFilePath);
}

module.exports = {
  wikiOutputToFile,
  refreshOutputFile,
};
