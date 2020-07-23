const { workerData, parentPort, isMainThread } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const $tw = require('tiddlywiki').TiddlyWiki();

async function startNodeJSWiki() {
  const { homePath, tiddlyWikiPort = 5112 } = workerData;
  const bobServerConfigFolderPath = path.join(homePath, 'settings');
  const bobServerConfigPath = path.join(bobServerConfigFolderPath, 'settings.json');
  try {
    if (
      await fs.promises
        .access(bobServerConfigPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false)
    ) {
      await fs.promises.unlink(bobServerConfigPath);
      await fs.promises.rmdir(bobServerConfigFolderPath);
    }
    await fs.promises.mkdir(bobServerConfigFolderPath);
  } catch (error) {
    parentPort.postMessage(`Configuring TW-Bob config folder failed with error ${error.message} ${error.stack}`);
  }
  try {
    const bobServerConfig = {
      serverName: 'TiddlyGit-Desktop',
      persistentUsernames: 'yes',
      heartbeat: {
        interval: 200,
        timeout: 1000,
      },
      enableBobSaver: 'no',
      enableSaver: 'no',
      saver: {
        disable: 'yes',
      },
      pluginsPath: './plugins',
      themesPath: './themes',
      editionsPath: './',
      wikiPathBase: homePath,
      'ws-server': {
        port: tiddlyWikiPort,
        host: '0.0.0.0',
        autoIncrementPort: false,
        rootTiddler: '$:/core/save/lazy-images',
      },
    };
    await fs.promises.writeFile(bobServerConfigPath, JSON.stringify(bobServerConfig, undefined, '  '));
  } catch (error) {
    parentPort.postMessage(`Configuring TW-Bob failed with error ${error.message} ${error.stack}`);
  }
  try {
    process.env.TIDDLYWIKI_PLUGIN_PATH = path.resolve(homePath, 'plugins');
    process.env.TIDDLYWIKI_THEME_PATH = path.resolve(homePath, 'themes');
    // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
    $tw.boot.argv = [
      '+plugins/OokTech/Bob',
      homePath,
      '--wsserver',
    ];
    $tw.boot.boot(() => parentPort.postMessage(`Tiddlywiki booted at http://localhost:${tiddlyWikiPort}`));
  } catch (error) {
    parentPort.postMessage(`Tiddlywiki booted failed with error ${error.message} ${error.stack}`);
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
