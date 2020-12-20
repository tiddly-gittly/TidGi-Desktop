/* eslint-disable global-require */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'fs'.
const fs = require('fs');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'logger'.
const { logger } = require('../log');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'commitAndS... Remove this comment to see the full error message
const { commitAndSync } = require('../git');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'watchWiki'... Remove this comment to see the full error message
const { watchWiki, stopWatchWiki } = require('./watch-wiki');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'startNodeJ... Remove this comment to see the full error message
const startNodeJSWiki = require('./start-nodejs-wiki');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'stopWiki'.
const { stopWiki, startWiki } = require('./wiki-worker-mamager');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'TIDDLERS_P... Remove this comment to see the full error message
const { TIDDLERS_PATH } = require('../../constants/paths');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPrefere... Remove this comment to see the full error message
const { getPreference } = require('../preferences');

// prevent private wiki try to restart wiki on start-up, where there will be several subsequent wikiStartup() call
const justStartedWiki = {};
function setWikiStarted(wikiPath: any) {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  justStartedWiki[wikiPath] = true;
  setTimeout(() => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    delete justStartedWiki[wikiPath];
  }, 5000);
}

module.exports = async function wikiStartup(workspace: any) {
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
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
