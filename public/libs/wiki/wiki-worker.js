const { workerData, parentPort, isMainThread } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const $tw = require('tiddlywiki').TiddlyWiki();

function startNodeJSWiki() {
  const { homePath, userName, tiddlyWikiPort = 5112 } = workerData;
  try {
    const bobServerConfigPath = path.join(homePath, 'settings', 'settings.json');
    if (fs.existsSync(bobServerConfigPath)) {
      fs.unlinkSync(bobServerConfigPath);
    }
    const bobServerConfig = {
      serverName: 'TiddlyGit-Desktop',
      persistentUsernames: 'yes',
      heartbeat: {
        interval: 200,
      },
      enableBobSaver: 'no',
      saver: {
        disable: 'yes',
      },
      pluginsPath: `./${homePath}/plugins`,
      themesPath: `./${homePath}/themes`,
      editionsPath: `./${homePath}/`,
      wikiPathBase: homePath,
      'ws-server': {
        port: tiddlyWikiPort,
        host: '0.0.0.0',
        autoIncrementPort: false,
        rootTiddler: '$:/core/save/lazy-images',
      },
    };
    fs.writeFileSync(bobServerConfigPath, JSON.stringify(bobServerConfig, undefined, '  '));
  } catch (error) {
    parentPort.postMessage(`Configuring TW-Bob failed with error ${error.message} ${error.trace}`);
  }
  try {
    process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
    process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
    // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
    $tw.boot.argv = [
      '+plugins/OokTech/Bob',
      homePath,
      '--wsserver', // port config in Meme-of-LinOnetwo/settings/settings.json
    ];
    $tw.boot.boot(() => parentPort.postMessage(`Tiddlywiki booted at http://localhost:${tiddlyWikiPort}`));
  } catch (error) {
    parentPort.postMessage(`Tiddlywiki booted failed with error ${error.message} ${error.trace}`);
  }
}
module.exports = startNodeJSWiki;

if (!isMainThread) {
  startNodeJSWiki();
  parentPort.once('message', async message => {
    if (typeof message === 'object' && message.type === 'command' && message.message === 'exit') {
      process.exit(0);
    }
  });
}
