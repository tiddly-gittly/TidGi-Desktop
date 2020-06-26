const path = require('path');
const fs = require('fs-extra');
const { dialog } = require('electron');
const $tw = require('tiddlywiki/boot/boot.js').TiddlyWiki();

const mainWindow = require('../windows/main');

const tiddlyWikiPort = 5112;
const userName = 'LinOnetwoTest';

module.exports = function startNodeJSWiki(homePath) {
  if ($tw.wiki) {
    console.error('Wiki has already started');
    return;
  }
  if (!homePath || typeof homePath !== 'string' || !path.isAbsolute(homePath)) {
    const errorMessage = `需要传入正确的路径，而 ${homePath} 无法被 TiddlyWiki 识别。`;
    console.error(errorMessage);
    dialog.showMessageBox(mainWindow.get(), {
      title: '传入的路径无法使用',
      message: errorMessage,
      buttons: ['OK'],
      cancelId: 0,
      defaultId: 0,
    });
    return;
  }
  if (!fs.pathExistsSync(homePath)) {
    const errorMessage = `无法找到之前还在该处的工作区文件夹！本应存在于 ${homePath} 的文件夹可能被移走了！`;
    console.error(errorMessage);
    dialog.showMessageBox(mainWindow.get(), {
      title: '工作区文件夹被移走',
      message: errorMessage,
      buttons: ['OK'],
      cancelId: 0,
      defaultId: 0,
    });
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
