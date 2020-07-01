/* eslint-disable no-console */
const { Worker } = require('worker_threads');
const isDev = require('electron-is-dev');

const path = require('path');

const WIKI_WORKER_PATH = isDev
? path.resolve(__dirname, './wiki-worker.js')
: path.resolve(process.resourcesPath, '..', 'wiki-worker.js');

// { [name: string]: Worker }
const workers = {};

module.exports.startWiki = function startWiki(homePath, tiddlyWikiPort, userName) {
  const workerData = { homePath, userName, tiddlyWikiPort };
  const worker = new Worker(WIKI_WORKER_PATH, { workerData });
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
