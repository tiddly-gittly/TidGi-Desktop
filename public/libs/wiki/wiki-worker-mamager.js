/* eslint-disable no-console */
const { Worker } = require('worker_threads');

// { [name: string]: Worker }
const workers = {};

module.exports.startWiki = function startWiki(homePath, userName, tiddlyWikiPort) {
  const workerData = { homePath, userName, tiddlyWikiPort };
  console.warn(`workerData`, JSON.stringify(workerData, null, '  '));
  const worker = new Worker(require.resolve('./wiki-worker.js'), { workerData });
  workers[homePath] = worker;
  worker.on('message', message => console.log(`[${homePath}] ${message}`));
  worker.on('error', error => console.error(`[${homePath}] ${error}`));
  worker.on('exit', code => {
    if (code !== 0) console.error(`[${homePath}] Worker stopped with exit code ${code}`);
  });
};
