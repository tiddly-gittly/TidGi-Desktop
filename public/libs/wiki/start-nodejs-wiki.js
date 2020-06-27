const path = require('path');
const fs = require('fs-extra');
const { dialog } = require('electron');

const { startWiki } = require('./wiki-worker-mamager');
const mainWindow = require('../../windows/main');

module.exports = function startNodeJSWiki(homePath, port, userName) {
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

  startWiki(homePath, port, userName);
};
