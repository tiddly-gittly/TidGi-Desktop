const path = require('path');
const { compact } = require('lodash');
const { GitProcess } = require('dugite');
// const { logger } = require('../log');
// const i18n = require('../i18n');

/**
 * Get modified files and modify type in a folder
 * @param {string} wikiFolderPath location to scan git modify state
 */
async function getModifiedFileList(wikiFolderPath) {
  const { stdout } = await GitProcess.exec(['status', '--porcelain'], wikiFolderPath);
  const stdoutLines = stdout.split('\n');
  return compact(stdoutLines)
    .map(line => line.match(/^\s?(\?\?|[ACMR]|[ACMR][DM])\s?(\S+)$/))
    .map(([_, type, fileRelativePath]) => ({
      type,
      fileRelativePath,
      filePath: path.join(wikiFolderPath, fileRelativePath),
    }));
}

module.exports = {
  getModifiedFileList,
};
