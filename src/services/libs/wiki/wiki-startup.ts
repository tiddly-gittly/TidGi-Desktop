/* eslint-disable global-require */
const path = require('path');
const fs = require('fs');

const { logger } = require('../log');
const { commitAndSync } = require('../git');
const { watchWiki, stopWatchWiki } = require('./watch-wiki');
const startNodeJSWiki = require('./start-nodejs-wiki');
const { stopWiki, startWiki } = require('./wiki-worker-mamager');
const { TIDDLERS_PATH } = require('../../constants/paths');
const { getPreference } = require('../preferences');

// prevent private wiki try to restart wiki on start-up, where there will be several subsequent wikiStartup() call
const justStartedWiki = {};
function setWikiStarted(wikiPath) {
  justStartedWiki[wikiPath] = true;
  setTimeout(() => {
    delete justStartedWiki[wikiPath];
  }, 5000);
}

module.exports = async function wikiStartup(workspace) {
  // remove $:/StoryList, otherwise it sometimes cause $__StoryList_1.tid to be generated
  try {
    fs.unlinkSync(path.resolve(workspace.name, 'tiddlers', '$__StoryList'));
  } catch {
    // do nothing
  }

  const userName = getPreference('userName') || '';
  const userInfo = getPreference('github-user-info');
  const { name: wikiPath, gitUrl: githubRepoUrl, port, isSubWiki, id } = workspace;
  // if is main wiki
  if (!isSubWiki) {
    setWikiStarted(wikiPath);
    await startNodeJSWiki(wikiPath, port, userName, id);
    userInfo && watchWiki(wikiPath, githubRepoUrl, userInfo, path.join(wikiPath, TIDDLERS_PATH));
  } else {
    // if is private repo wiki
    userInfo && watchWiki(wikiPath, githubRepoUrl, userInfo);
    // if we are creating a sub-wiki, restart the main wiki to load content from private wiki
    const mainWikiPath = workspace.mainWikiToLink;
    if (!justStartedWiki[mainWikiPath]) {
      const { getWorkspaceByName } = require('../workspaces');
      const mainWorkspace = getWorkspaceByName(mainWikiPath);
      await stopWatchWiki(mainWikiPath);
      await stopWiki(mainWikiPath);
      await startWiki(mainWikiPath, mainWorkspace.port, userName);
      await watchWiki(mainWikiPath, githubRepoUrl, userInfo);
    }
  }
};
