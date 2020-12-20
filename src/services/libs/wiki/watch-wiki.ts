// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'fs'.
const fs = require('fs');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
const chokidar = require('chokidar');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'trim'.
const { trim, compact, debounce } = require('lodash');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPrefere... Remove this comment to see the full error message
const { getPreference } = require('../preferences');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'logger'.
const { logger } = require('../log');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'commitAndS... Remove this comment to see the full error message
const { commitAndSync } = require('../git');

const syncDebounceInterval = getPreference('syncDebounceInterval');
const debounceCommitAndSync = debounce(commitAndSync, syncDebounceInterval);

const frequentlyChangedFileThatShouldBeIgnoredFromWatch = ['output', /\$__StoryList/];
const topLevelFoldersToIgnored = ['node_modules', '.git'];

// key is same to workspace name, so we can get this watcher by workspace name
// { [name: string]: Watcher }
const wikiWatchers = {};

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'watchWiki'... Remove this comment to see the full error message
function watchWiki(wikiRepoPath: any, githubRepoUrl: any, userInfo: any, wikiFolderPath = wikiRepoPath) {
  if (!fs.existsSync(wikiRepoPath)) {
    return logger.error('Folder not exist in watchFolder()', { wikiRepoPath, wikiFolderPath, githubRepoUrl });
  }
  const onChange = debounce(async (fileName: any) => {
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
    logger.info(`Fail to load .gitignore from ${gitIgnoreFilePath}, this is ok if you don't need a .gitignore in the subwiki.`, {
      wikiRepoPath,
      wikiFolderPath,
      githubRepoUrl,
    });
  }
  const filesToIgnoreFromGitIgnore = compact(gitignoreFile.split('\n').filter((line) => !trim(line).startsWith('#')));
  const watcher = chokidar.watch(wikiFolderPath, {
    ignored: [...filesToIgnoreFromGitIgnore, ...topLevelFoldersToIgnored, ...frequentlyChangedFileThatShouldBeIgnoredFromWatch],
    cwd: wikiFolderPath,
    awaitWriteFinish: true,
    ignoreInitial: true,
    followSymlinks: false,
  });
  watcher.on('add', onChange);
  watcher.on('change', onChange);
  watcher.on('unlink', onChange);
  return new Promise((resolve) => {
    watcher.on('ready', () => {
      logger.info(`wiki Github syncer is watching ${wikiFolderPath} now`, { wikiRepoPath, wikiFolderPath, githubRepoUrl });
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      wikiWatchers[wikiRepoPath] = watcher;
      // @ts-expect-error ts-migrate(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
      resolve();
    });
  });
}

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'stopWatchW... Remove this comment to see the full error message
async function stopWatchWiki(wikiRepoPath: any) {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
