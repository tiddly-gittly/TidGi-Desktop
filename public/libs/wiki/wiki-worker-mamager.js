/* eslint-disable global-require */
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

// don't forget to config option in `dist.js` https://github.com/electron/electron/issues/18540#issuecomment-652430001
// to copy all worker.js and its local dependence to `process.resourcesPath`
const WIKI_WORKER_PATH = isDev
  ? path.resolve(__dirname, './wiki-worker.js')
  : path.resolve(process.resourcesPath, 'app.asar.unpacked', 'wiki-worker.js');

module.exports.startWiki = function startWiki(homePath, tiddlyWikiPort, userName) {
  // require here to prevent circular dependence, which will cause "TypeError: getWorkspaceByName is not a function"
  const { getWorkspaceByName } = require('../workspaces');
  const { reloadViewsWebContentsIfDidFailLoad } = require('../views');
  const { setWorkspaceMeta } = require('../workspace-metas');
  const workspace = getWorkspaceByName(homePath);
  const workspaceID = workspace?.id;
  if (!workspace || !workspaceID) {
    logger.error('Try to start wiki, but workspace not found', { homePath, workspace, workspaceID });
    return;
  }
  setWorkspaceMeta(workspaceID, { isLoading: true });
  const workerData = { homePath, userName, tiddlyWikiPort };
  const worker = new Worker(WIKI_WORKER_PATH, { workerData });
  wikiWorkers[homePath] = worker;
  const loggerMeta = { worker: 'NodeJSWiki', homePath };
  const loggerForWorker = logMessage(loggerMeta);
  let started = false;
  worker.on('message', message => {
    console.log(message);
    loggerForWorker(message);
    if (!started) {
      started = true;
      setTimeout(() => {
        reloadViewsWebContentsIfDidFailLoad();
        setWorkspaceMeta(workspaceID, { isLoading: false });
        // close add-workspace dialog
        const { get } = require('../../windows/add-workspace');
        if (get()) {
          get().close();
        }
      }, 100);
    }
  });
  worker.on('error', error => {
    console.log(error);
    logger.error(error.message, { ...loggerMeta, ...error });
  });
  worker.on('exit', code => {
    if (code !== 0) delete wikiWorkers[homePath];
    logger.warning(`NodeJSWiki ${homePath} Worker stopped with exit code ${code}.`, loggerMeta);
  });
};
async function stopWiki(homePath) {
  const worker = wikiWorkers[homePath];
  if (!worker) {
    logger.warning(
      `No wiki watcher for ${homePath}. No running worker, means maybe tiddlywiki server in this workspace failed to start`,
      { function: 'stopWiki' },
    );
    return Promise.resolve();
  }
  return new Promise(resolve => {
    worker.postMessage({ type: 'command', message: 'exit' });
    worker.on('exit', () => {
      delete wikiWorkers[homePath];
      logger.info(`Wiki-worker for ${homePath} stopped`, { function: 'stopWiki' });
      resolve();
    });
  });
}
module.exports.stopWiki = stopWiki;

/**
 * Stop all worker_thread, use and await this before app.quit()
 */
module.exports.stopAllWiki = async function stopAllWiki() {
  const tasks = [];
  for (const homePath of Object.keys(wikiWorkers)) {
    tasks.push(stopWiki(homePath));
  }
  await Promise.all(tasks);
  logger.info('All wiki-worker is stopped', { function: 'stopAllWiki' });
};
