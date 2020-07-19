/* eslint-disable no-console */
const { Worker } = require('worker_threads');
const isDev = require('electron-is-dev');
const path = require('path');

const { logger } = require('../log');

// worker should send payload in form of `{ message: string, handler: string }` where `handler` is the name of function to call
const logMessage = loggerMeta => message => {
  if (typeof message === 'string') {
    logger.info(message, loggerMeta);
  } else if (typeof message === 'object' && message.payload) {
    const { type, payload } = message;
    if (type === 'progress') {
      logger.info(payload.message, { ...loggerMeta, handler: payload.handler });
    } else {
      logger.info(payload, loggerMeta);
    }
  }
};

// key is same to workspace name, so we can get this worker by workspace name
// { [name: string]: Worker }
const wikiWorkers = {};
const wikiWatcherWorkers = {};

// don't forget to config option in `dist.js` https://github.com/electron/electron/issues/18540#issuecomment-652430001
// to copy all worker.js and its local dependence to `process.resourcesPath`
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
  const loggerMeta = { worker: 'NodeJSWiki', homePath };
  worker.on('message', logMessage(loggerMeta));
  worker.on('error', error => logger.error(error), loggerMeta);
  worker.on('exit', code => {
    if (code !== 0)
      logger.warn(
        `NodeJSWiki ${homePath} Worker stopped with exit code ${code}, this also happen normally when you delete a workspace.`,
        loggerMeta,
      );
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
  const workerData = { wikiRepoPath, githubRepoUrl, userInfo, wikiFolderPath, syncDebounceInterval, isDev };
  const worker = new Worker(WIKI_WATCHER_WORKER_PATH, { workerData });
  wikiWatcherWorkers[wikiRepoPath] = worker;
  const loggerMeta = { worker: 'WikiWatcher', wikiRepoPath };
  worker.on('message', logMessage(loggerMeta));
  worker.on('error', error => logger.error(error, loggerMeta));
  worker.on('exit', code => {
    if (code !== 0)
      logger.warn(
        `WikiWatcher ${wikiRepoPath} Worker stopped with exit code ${code}, this also happen normally when you delete a workspace.`,
        loggerMeta,
      );
  });
};

module.exports.stopWikiWatcher = function stopWikiWatcher(wikiRepoPath) {
  const worker = wikiWatcherWorkers[wikiRepoPath];
  if (!worker) return; // no running worker, maybe tiddlywiki server in this workspace failed to start
  worker.terminate();
};

/**
 * Stop all worker_thread, use and await this before app.quit()
 */
module.exports.stopAll = function stopAll() {
  const tasks = [];
  for (const wikiRepoPath of Object.keys(wikiWatcherWorkers)) {
    tasks.push(wikiWatcherWorkers[wikiRepoPath].terminate());
  }
  for (const homePath of Object.keys(wikiWorkers)) {
    tasks.push(wikiWorkers[homePath].terminate());
  }
  return Promise.all(tasks);
};
