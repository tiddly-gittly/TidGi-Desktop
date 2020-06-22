const path = require('path');
const { execSync } = require('child_process');
const $tw = require('tiddlywiki/boot/boot.js').TiddlyWiki();

const tiddlyWikiPort = 5112;
const wikiFolderName = 'wiki';
const userName = 'LinOnetwoTest';

const repoFolder = path.join(path.dirname(__filename), '..');

const tiddlyWikiFolder = path.join(repoFolder, wikiFolderName);
const tiddlersFolder = path.join(tiddlyWikiFolder, 'tiddlers');

process.env.TIDDLYWIKI_PLUGIN_PATH = `${tiddlyWikiFolder}/plugins`;
process.env.TIDDLYWIKI_THEME_PATH = `${tiddlyWikiFolder}/themes`;
// add tiddly filesystem back https://github.com/Jermolene/TiddlyWiki5/issues/4484#issuecomment-596779416
$tw.boot.argv = [
  '+plugins/tiddlywiki/filesystem',
  '+plugins/tiddlywiki/tiddlyweb',
  tiddlyWikiFolder,
  '--listen',
  `anon-username=${userName}`,
  `port=${tiddlyWikiPort}`,
  'host=0.0.0.0',
  'root-tiddler=$:/core/save/lazy-images',
];

try {
  execSync(`find ${tiddlersFolder} -name '*StoryList.tid' -delete`);
} catch (error) {
  console.log(String(error));
}

module.exports = function startNodeJSWiki() {
  $tw.boot.boot();
};
