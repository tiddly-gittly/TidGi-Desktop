const { workerData, parentPort, isMainThread } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { trim, compact } = require('lodash');

const { commitAndSync } = require('../git');

const frequentlyChangedFileThatShouldBeIgnoredFromWatch = ['output', /\$__StoryList/];
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

let watcher;
function watchFolder(wikiRepoPath, wikiFolderPath, githubRepoUrl, userInfo, syncDebounceInterval) {
  const debounceCommitAndSync = debounce(commitAndSync, syncDebounceInterval);
  const onChange = debounce(async (fileName) => {
    if (lock) {
      parentPort.postMessage(`${fileName} changed, but lock is on, so skip`);
      return;
    }
    parentPort.postMessage(`${fileName} changed`);
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
  } catch (error) {
    parentPort.postMessage(`Error: fail to load .gitignore from ${gitIgnoreFilePath} \n ${error} ${error.stack}`);
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
  const { wikiRepoPath, githubRepoUrl, userInfo, wikiFolderPath, syncDebounceInterval } = workerData;
  watchFolder(wikiRepoPath, wikiFolderPath, githubRepoUrl, userInfo, syncDebounceInterval);
}

if (!isMainThread) {
  watchWiki();
}
