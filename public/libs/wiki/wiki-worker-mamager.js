/* eslint-disable no-console */
const { Worker } = require('worker_threads');
const isDev = require('electron-is-dev');

const path = require('path');

// key is same to workspace name, so we can get this worker by workspace name
// { [name: string]: Worker }
const wikiWorkers = {};
const wikiWatcherWorkers = {};

// don't forget to config option in dist.js https://github.com/electron/electron/issues/18540#issuecomment-652430001
const WIKI_WORKER_PATH = isDev
  ? path.resolve(__dirname, './wiki-worker.js')
  : path.resolve(process.resourcesPath, '..', 'wiki-worker.js');
const WIKI_WATCHER_WORKER_PATH = isDev
  ? path.resolve(__dirname, './watch-wiki-worker.js')
  : path.resolve(process.resourcesPath, '..', 'watch-wiki-worker.js');

module.exports.startWiki = function startWiki(homePath, tiddlyWikiPort, userName) {
  const workerData = { homePath, userName, tiddlyWikiPort };
  const worker = new Worker(WIKI_WORKER_PATH, { workerData });
  wikiWorkers[homePath] = worker;
  worker.on('message', message => console.log(`[NodeJSWiki ${homePath}] ${message}`));
  worker.on('error', error => console.error(`[NodeJSWiki ${homePath}] ${error}`));
  worker.on('exit', code => {
    if (code !== 0) console.error(`[NodeJSWiki ${homePath}] Worker stopped with exit code ${code}`);
  });
};
module.exports.stopWiki = function stopWiki(homePath) {
  const worker = wikiWorkers[homePath];
  if (!worker) return; // no running worker, maybe tiddlywiki server in this workspace failed to start
  worker.terminate();
};

module.exports.startWikiWatcher = function startWikiWatcher(
  wikiRepoPath,
  githubRepoUrl,
  userInfo,
  wikiFolderPath,
  syncDebounceInterval,
) {
  const workerData = { wikiRepoPath, githubRepoUrl, userInfo, wikiFolderPath, syncDebounceInterval };
  const worker = new Worker(WIKI_WATCHER_WORKER_PATH, { workerData });
  wikiWatcherWorkers[wikiRepoPath] = worker;
  worker.on('message', message => console.log(`[WikiWatcher ${wikiRepoPath}] ${message}`));
  worker.on('error', error => console.error(`[WikiWatcher ${wikiRepoPath}] ${error}`));
  worker.on('exit', code => {
    if (code !== 0) console.error(`[WikiWatcher ${wikiRepoPath}] Worker stopped with exit code ${code}`);
  });
};

module.exports.stopWikiWatcher = function stopWikiWatcher(wikiRepoPath) {
  const worker = wikiWatcherWorkers[wikiRepoPath];
  if (!worker) return; // no running worker, maybe tiddlywiki server in this workspace failed to start
  worker.terminate();
};
