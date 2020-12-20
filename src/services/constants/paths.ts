import isDev from 'electron-is-dev';
import path from 'path';
import os from 'os';

const isMac = process.platform === 'darwin';

const REACT_PATH = isDev ? 'http://localhost:3000' : `file://${path.resolve(__dirname, '..', '..', 'build', 'index.html')}`;
// .app/Contents/Resources/wiki/
const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isDev ? path.resolve(__dirname, '..', '..', 'template', 'wiki') : path.resolve(process.resourcesPath, '..', 'wiki');
const TIDDLERS_PATH = 'tiddlers';
const ICON_PATH = isDev ? path.resolve(__dirname, '..', 'icon.png') : `file://${path.resolve(__dirname, '..', 'icon.png')}`;
const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
const LOG_FOLDER = isDev
  ? path.resolve(__dirname, '..', '..', 'logs')
  : isMac
  ? path.resolve(process.resourcesPath, '..', 'logs')
  : path.resolve(os.homedir(), '.tg-note', 'logs');
const LOCALIZATION_FOLDER = isDev ? path.resolve(__dirname, '..', '..', 'localization') : path.resolve(process.resourcesPath, '..', 'localization');

export { REACT_PATH, TIDDLYWIKI_TEMPLATE_FOLDER_PATH, TIDDLERS_PATH, ICON_PATH, CHROME_ERROR_PATH, DESKTOP_PATH, LOG_FOLDER, LOCALIZATION_FOLDER, isDev };
