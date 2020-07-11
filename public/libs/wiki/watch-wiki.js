const fs = require('fs');

const { commitAndSync } = require('../git');
const { getPreference } = require('../preferences');

const frequentlyChangedFileThatShouldBeIgnoredFromWatch = new Set(['output', '$__StoryList.tid']);
const topLevelFoldersToIgnored = ['node_modules', '.git'];

/** https://davidwalsh.name/javascript-debounce-function */
function debounce(func, wait, immediate) {
  let timeout;
  return function debounced() {
    const context = this;
    // eslint-disable-next-line no-underscore-dangle, prefer-rest-params
    const arguments_ = arguments;
    const later = function later() {
      timeout = undefined;
      if (!immediate) func.apply(context, arguments_);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, arguments_);
  };
}

const debounceCommitAndSync = debounce(commitAndSync, getPreference('syncDebounceInterval'));

function watchFolder(wikiRepoPath, wikiFolderPath) {
  fs.watch(
    wikiFolderPath,
    { recursive: true },
    debounce((_, fileName) => {
      if (topLevelFoldersToIgnored.some(name => fileName.startsWith(name))) return;
      if (frequentlyChangedFileThatShouldBeIgnoredFromWatch.has(fileName)) return;
      console.log(`${fileName} change`);

      debounceCommitAndSync(wikiRepoPath);
    }, 100),
  );
  console.log(`wiki watch ${wikiFolderPath} now`);
}

module.exports = function watchWiki(wikiRepoPath, wikiFolderPath = wikiRepoPath) {
  if (fs.existsSync(wikiRepoPath)) {
    watchFolder(wikiRepoPath, wikiFolderPath);
  }
};
