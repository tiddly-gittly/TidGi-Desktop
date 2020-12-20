// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'compact'.
const { compact } = require('lodash');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'GitProcess... Remove this comment to see the full error message
const { GitProcess } = require('dugite');
// const { logger } = require('../log');
// const i18n = require('../i18n');

/**
 * Get modified files and modify type in a folder
 * @param {string} wikiFolderPath location to scan git modify state
 */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getModifie... Remove this comment to see the full error message
async function getModifiedFileList(wikiFolderPath: any) {
  const { stdout } = await GitProcess.exec(['status', '--porcelain'], wikiFolderPath);
  const stdoutLines = stdout.split('\n');
  return (
    compact(stdoutLines)
      .map((line: any) => line.match(/^\s?(\?\?|[ACMR]|[ACMR][DM])\s?(\S+)$/))
      // @ts-expect-error ts-migrate(7031) FIXME: Binding element '_' implicitly has an 'any' type.
      .map(([_, type, fileRelativePath]) => ({
        type,
        fileRelativePath,
        filePath: path.join(wikiFolderPath, fileRelativePath),
      }))
  );
}

module.exports = {
  getModifiedFileList,
};
