const path = require('path');
const $tw = require('tiddlywiki/boot/boot.js').TiddlyWiki();

const tiddlyWikiPort = 5112;
const userName = 'LinOnetwoTest';

module.exports = function startNodeJSWiki(homePath) {
  if ($tw.wiki) {
    console.error('Wiki has already started');
    return;
  }
  if (!homePath || typeof homePath !== 'string' || !path.isAbsolute(homePath)) {
    console.error(
      `valie absolute homePath not provided to startNodeJSWiki(homePath), received ${homePath} which is invalid.`
    );
    return;
  }

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
  $tw.boot.boot();
};
