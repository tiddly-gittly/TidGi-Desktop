const fs = require('fs');

const { startWikiWatcher } = require('./wiki-worker-mamager');
const { getPreference } = require('../preferences');

module.exports = function watchWiki(wikiRepoPath, githubRepoUrl, userInfo, wikiFolderPath = wikiRepoPath) {
  if (fs.existsSync(wikiRepoPath)) {
    const syncDebounceInterval = getPreference('syncDebounceInterval')
    startWikiWatcher(wikiRepoPath, githubRepoUrl, userInfo, wikiFolderPath, syncDebounceInterval);
  }
};
