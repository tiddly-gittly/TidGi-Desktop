const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { trim, compact, debounce } = require('lodash');

const { getPreference } = require('../preferences');
const { logger } = require('../log');
const { commitAndSync } = require('../git');

const syncDebounceInterval = getPreference('syncDebounceInterval');
const debounceCommitAndSync = debounce(commitAndSync, syncDebounceInterval);

const frequentlyChangedFileThatShouldBeIgnoredFromWatch = ['output', /\$__StoryList/];
const topLevelFoldersToIgnored = ['node_modules', '.git'];

// key is same to workspace name, so we can get this watcher by workspace name
// { [name: string]: Watcher }
const wikiWatchers = {};

function watchWiki(wikiRepoPath, githubRepoUrl, userInfo, wikiFolderPath = wikiRepoPath) {
  if (!fs.existsSync(wikiRepoPath)) {
    return logger.error('Folder not exist in watchFolder()', { wikiRepoPath, wikiFolderPath, githubRepoUrl });
  }
  const onChange = debounce(async fileName => {
    if (lock) {
      logger.info(`${fileName} changed, but lock is on, so skip`);
      return;
    }
    logger.info(`${fileName} changed`);
    lock = true;
    await debounceCommitAndSync(wikiRepoPath, githubRepoUrl, userInfo);
    lock = false;
  }, 1000);
  // simple lock to prevent running two instance of commit task
  let lock = false;
  // load ignore config from .gitignore located in the wiki repo folder
  const gitIgnoreFilePath = path.join(wikiRepoPath, '.gitignore');
  let gitignoreFile = '';
  try {
    gitignoreFile = fs.readFileSync(gitIgnoreFilePath, 'utf-8') || '';
  } catch {
    logger.info(
      `Fail to load .gitignore from ${gitIgnoreFilePath}, this is ok if you don't need a .gitignore in the subwiki.`,
      { wikiRepoPath, wikiFolderPath, githubRepoUrl },
    );
  }
  const filesToIgnoreFromGitIgnore = compact(gitignoreFile.split('\n').filter(line => !trim(line).startsWith('#')));
  const watcher = chokidar.watch(wikiFolderPath, {
    ignored: [
      ...filesToIgnoreFromGitIgnore,
      ...topLevelFoldersToIgnored,
      ...frequentlyChangedFileThatShouldBeIgnoredFromWatch,
    ],
    cwd: wikiFolderPath,
    awaitWriteFinish: true,
    ignoreInitial: true,
    followSymlinks: false,
  });
  watcher.on('add', onChange);
  watcher.on('change', onChange);
  watcher.on('unlink', onChange);
  return new Promise(resolve => {
    watcher.on('ready', () => {
      logger.info(`wiki Github syncer is watching ${wikiFolderPath} now`, { wikiRepoPath, wikiFolderPath, githubRepoUrl });
      wikiWatchers[wikiRepoPath] = watcher;
      resolve();
    });
  });
}

async function stopWatchWiki(wikiRepoPath) {
  const watcher = wikiWatchers[wikiRepoPath];
  if (watcher) {
    await watcher.close();
    logger.info(`Wiki watcher for ${wikiRepoPath} stopped`, { function: 'stopWatchWiki' });
  } else {
    logger.warning(`No wiki watcher for ${wikiRepoPath}`, { function: 'stopWatchWiki' });
  }
}

async function stopWatchAllWiki() {
  const tasks = [];
  for (const homePath of Object.keys(wikiWatchers)) {
    tasks.push(stopWatchWiki(homePath));
  }
  await Promise.all(tasks);
  logger.info('All wiki watcher is stopped', { function: 'stopWatchAllWiki' });
}

module.exports = {
  watchWiki,
  stopWatchWiki,
  stopWatchAllWiki,
};
