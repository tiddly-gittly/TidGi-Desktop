/* eslint-disable no-console */
const { Worker } = require('worker_threads');

// { [name: string]: Worker }
const workers = {};

module.exports.startWiki = function startWiki(homePath, tiddlyWikiPort, userName) {
  const workerData = { homePath, userName, tiddlyWikiPort };
  const worker = new Worker(require.resolve('./wiki-worker.js'), { workerData });
  workers[homePath] = worker;
  worker.on('message', message => console.log(`[${homePath}] ${message}`));
  worker.on('error', error => console.error(`[${homePath}] ${error}`));
  worker.on('exit', code => {
    if (code !== 0) console.error(`[${homePath}] Worker stopped with exit code ${code}`);
  });
};

module.exports.stopWiki = function stopWiki(homePath) {
  const worker = workers[homePath];
  if (!worker) return; // no running worker, maybe tiddlywiki server in this workspace failed to start
  worker.terminate();
};
