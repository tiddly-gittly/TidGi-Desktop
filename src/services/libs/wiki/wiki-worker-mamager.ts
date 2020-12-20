/* eslint-disable global-require */
/* eslint-disable no-console */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'Worker'.
const { Worker } = require('worker_threads');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'isDev'.
const isDev = require('electron-is-dev');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'Promise'.
const Promise = require('bluebird');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'logger'.
const { logger } = require('../log');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'wikiOutput... Remove this comment to see the full error message
const { wikiOutputToFile, refreshOutputFile } = require('../log/wiki-output');
// worker should send payload in form of `{ message: string, handler: string }` where `handler` is the name of function to call
const logMessage = (loggerMeta: any) => (message: any) => {
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
const WIKI_WORKER_PATH = isDev ? path.resolve(__dirname, './wiki-worker.js') : path.resolve(process.resourcesPath, 'app.asar.unpacked', 'wiki-worker.js');
module.exports.startWiki = function startWiki(homePath: any, tiddlyWikiPort: any, userName: any) {
  return new Promise((resolve, reject) => {
    // require here to prevent circular dependence, which will cause "TypeError: getWorkspaceByName is not a function"
    const { getWorkspaceByName } = require('../workspaces');
    const { reloadViewsWebContents } = require('../views');
    const { setWorkspaceMeta } = require('../workspace-metas');
    const workspace = getWorkspaceByName(homePath);
    const workspaceID = workspace?.id;
    if (!workspace || !workspaceID) {
      logger.error('Try to start wiki, but workspace not found', { homePath, workspace, workspaceID });
      return;
    }
    setWorkspaceMeta(workspaceID, { isLoading: true });
    const workerData = { homePath, userName, tiddlyWikiPort };
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ workerData: { homePath: any; u... Remove this comment to see the full error message
    const worker = new Worker(WIKI_WORKER_PATH, { workerData });
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    wikiWorkers[homePath] = worker;
    const loggerMeta = { worker: 'NodeJSWiki', homePath };
    const loggerForWorker = logMessage(loggerMeta);
    let started = false;
    (worker as any).on('error', (error: any) => {
      console.log(error);
      logger.error(error.message, { ...loggerMeta, ...error });
      reject(error);
    });
    (worker as any).on('exit', (code: any) => {
      if (code !== 0) {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        delete wikiWorkers[homePath];
      }
      logger.warning(`NodeJSWiki ${homePath} Worker stopped with exit code ${code}.`, loggerMeta);
      // @ts-expect-error ts-migrate(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
      resolve();
    });
    (worker as any).on('message', (message: any) => {
      console.log(message);
      loggerForWorker(message);
      if (!started) {
        started = true;
        setTimeout(() => {
          reloadViewsWebContents();
          setWorkspaceMeta(workspaceID, { isLoading: false });
          // close add-workspace dialog
          const { get } = require('../../windows/add-workspace');
          if (get()) {
            get().close();
          }
          // @ts-expect-error ts-migrate(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        }, 100);
      }
    });
    // redirect stdout to file
    const logFileName = workspace.name.replace(/[/\\]/g, '_');
    refreshOutputFile(logFileName);
    wikiOutputToFile(logFileName, (worker as any).stdout);
    wikiOutputToFile(logFileName, (worker as any).stderr);
  });
};
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'stopWiki'.
async function stopWiki(homePath: any) {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const worker = wikiWorkers[homePath];
  if (!worker) {
    logger.warning(`No wiki watcher for ${homePath}. No running worker, means maybe tiddlywiki server in this workspace failed to start`, {
      function: 'stopWiki',
    });
    return await Promise.resolve();
  }
  return (
    (new Promise((resolve) => {
      worker.postMessage({ type: 'command', message: 'exit' });
      worker.once('exit', resolve);
      worker.once('error', resolve);
    }) as any)
      .timeout(100)
      .catch((error: any) => {
        logger.info(`Wiki-worker have error ${error} when try to stop`, { function: 'stopWiki' });
        return worker.terminate();
      })
      // eslint-disable-next-line promise/always-return
      .then(() => {
        // delete wikiWorkers[homePath];
        logger.info(`Wiki-worker for ${homePath} stopped`, { function: 'stopWiki' });
      })
  );
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
  // try to prevent https://github.com/electron/electron/issues/23315, but seems not working at all
  await (Promise as any).delay(100);
  logger.info('All wiki-worker is stopped', { function: 'stopAllWiki' });
};
