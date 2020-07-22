const { workerData, parentPort, isMainThread } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { trim, compact, debounce } = require('lodash');

const frequentlyChangedFileThatShouldBeIgnoredFromWatch = ['output', /\$__StoryList/];
const topLevelFoldersToIgnored = ['node_modules', '.git'];

let watcher;
function watchFolder(wikiRepoPath, wikiFolderPath, githubRepoUrl, userInfo, syncDebounceInterval, isDevelopment) {
  // eslint-disable-next-line import/no-unresolved, global-require
  const { commitAndSync } = isDevelopment ? require('../git') : require('./git');
  const debounceCommitAndSync = debounce(commitAndSync, syncDebounceInterval);
  const onChange = debounce(async fileName => {
    if (lock) {
      parentPort.postMessage(`${fileName} changed, but lock is on, so skip`);
      return;
    }
    parentPort.postMessage(`${fileName} changed`);
    lock = true;
    await debounceCommitAndSync(wikiRepoPath, githubRepoUrl, userInfo, parentPort.postMessage.bind(parentPort));
    lock = false;
  }, 1000);
  // simple lock to prevent running two instance of commit task
  let lock = false;
  // load ignore config from .gitignore located in the wiki repo folder
  const gitIgnoreFilePath = path.join(wikiRepoPath, '.gitignore');
  let gitignoreFile = '';
  try {
    gitignoreFile = fs.readFileSync(gitIgnoreFilePath, 'utf-8') || '';
  } catch (error) {
    parentPort.postMessage(
      `Fail to load .gitignore from ${gitIgnoreFilePath}, this is ok if you don't need a .gitignore in the subwiki. \n ${error} ${error.stack}`,
    );
  }
  const filesToIgnoreFromGitIgnore = compact(gitignoreFile.split('\n').filter(line => !trim(line).startsWith('#')));
  watcher = chokidar.watch(wikiFolderPath, {
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
  watcher.on('ready', () => parentPort.postMessage(`wiki Github syncer is watching ${wikiFolderPath} now`));
}

function watchWiki() {
  const { wikiRepoPath, githubRepoUrl, userInfo, wikiFolderPath, syncDebounceInterval, isDev } = workerData;
  watchFolder(wikiRepoPath, wikiFolderPath, githubRepoUrl, userInfo, syncDebounceInterval, isDev);
}

if (!isMainThread) {
  watchWiki();
  parentPort.once('message', async message => {
    if (typeof message === 'object' && message.type === 'command' && message.message === 'exit' && watcher) {
      await watcher.close();
      process.exit(0);
    }
  });
}
