const { workerData, parentPort, isMainThread } = require('worker_threads');
const path = require('path');
const $tw = require('tiddlywiki').TiddlyWiki();

function startNodeJSWiki() {
  const { homePath, userName, tiddlyWikiPort = 5112 } = workerData;
  try {
    process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
    process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
    // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
    $tw.boot.argv = [
      '+plugins/tiddlywiki/filesystem',
      '+plugins/tiddlywiki/tiddlyweb',
      homePath,
      '--listen',
      `anon-username=${userName}`,
      `port=${tiddlyWikiPort}`,
      'host=0.0.0.0',
      'root-tiddler=$:/core/save/lazy-images',
    ];
    $tw.boot.boot(() => parentPort.postMessage(`Tiddlywiki booted at http://localhost:${tiddlyWikiPort}`));
  } catch (error) {
    parentPort.postMessage(`Tiddlywiki booted failed with error ${error.message} ${error.trace}`);
  }
}
module.exports = startNodeJSWiki;

if (!isMainThread) {
  startNodeJSWiki();
}
