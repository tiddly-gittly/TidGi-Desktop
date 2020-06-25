const isDev = require('electron-is-dev');
const path = require('path');

const REACT_PATH = isDev
  ? 'http://localhost:3000'
  : `file://${path.resolve(__dirname, '..', '..', 'build', 'index.html')}`;
// .app/Contents/Resources/wiki/
const TIDDLYWIKI_FOLDER_PATH = isDev
  ? path.resolve(__dirname, '..', '..', 'template', 'wiki')
  : path.resolve(process.resourcesPath, '..', 'wiki');
const ICON_PATH = isDev
  ? path.resolve(__dirname, '..', 'icon.png')
  : `file://${path.resolve(__dirname, '..', 'icon.png')}`;

module.exports = {
  REACT_PATH,
  TIDDLYWIKI_FOLDER_PATH,
  ICON_PATH,
};
