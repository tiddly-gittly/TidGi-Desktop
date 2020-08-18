const path = require('path');

const { logger } = require('../log');
const { commitAndSync } = require('../git');
const { watchWiki } = require('./watch-wiki');
const startNodeJSWiki = require('./start-nodejs-wiki');
const { TIDDLERS_PATH } = require('../../constants/paths');
const { getPreference } = require('../preferences');

module.exports = async function wikiStartup(workspace) {
  const userName = getPreference('userName') || '';
  const userInfo = getPreference('github-user-info');
  const { name: wikiPath, gitUrl: githubRepoUrl, port, isSubWiki, id } = workspace;
  if (!isSubWiki) {
    // if is main wiki
    await startNodeJSWiki(wikiPath, port, userName, id);
    userInfo && watchWiki(wikiPath, githubRepoUrl, userInfo, path.join(wikiPath, TIDDLERS_PATH));
  } else {
    // if is private repo wiki
    userInfo && watchWiki(wikiPath, githubRepoUrl, userInfo);
  }
  try {
    // wait for wiki's watch-fs plugin to be fully initialized
    await commitAndSync(wikiPath, githubRepoUrl, userInfo);
  } catch {
    logger.warning(`Can't sync at wikiStartup()`);
  }
};
