// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'initWikiGi... Remove this comment to see the full error message
const { initWikiGit, commitAndSync, getRemoteUrl, clone } = require('./sync');

module.exports = {
  initWikiGit,
  commitAndSync,
  getRemoteUrl,
  clone,
};
