const $tw = require('tiddlywiki/boot/boot.js').TiddlyWiki();
const { TIDDLYWIKI_FOLDER_PATH } = require('../constants/paths');

const tiddlyWikiPort = 5112;
const userName = 'LinOnetwoTest';

module.exports = function startNodeJSWiki() {
  process.env.TIDDLYWIKI_PLUGIN_PATH = `${TIDDLYWIKI_FOLDER_PATH}/plugins`;
  process.env.TIDDLYWIKI_THEME_PATH = `${TIDDLYWIKI_FOLDER_PATH}/themes`;
  // add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
  $tw.boot.argv = [
    '+plugins/tiddlywiki/filesystem',
    '+plugins/tiddlywiki/tiddlyweb',
    TIDDLYWIKI_FOLDER_PATH,
    '--listen',
    `anon-username=${userName}`,
    `port=${tiddlyWikiPort}`,
    'host=0.0.0.0',
    'root-tiddler=$:/core/save/lazy-images',
  ];
  $tw.boot.boot();
};
