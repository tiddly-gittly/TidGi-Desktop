import isDev from 'electron-is-dev';
import path from 'path';
import os from 'os';

const isMac = process.platform === 'darwin';

const sourcePath = path.resolve(__dirname, '..', '..');
export const buildResourcePath = path.resolve(sourcePath, '..', 'build-resources');

const REACT_PATH = MAIN_WINDOW_WEBPACK_ENTRY;
// .app/Contents/Resources/wiki/
const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isDev ? path.resolve(sourcePath, '..', 'template', 'wiki') : path.resolve(process.resourcesPath, '..', 'wiki');
const TIDDLERS_PATH = 'tiddlers';
const ICON_PATH = isDev ? path.resolve(buildResourcePath, 'icon.png') : `file://${path.resolve(__dirname, '..', 'icon.png')}`;
const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
const LOG_FOLDER = isDev
  ? path.resolve(sourcePath, '..', 'logs')
  : isMac
  ? path.resolve(process.resourcesPath, '..', 'logs')
  : path.resolve(os.homedir(), '.tg-note', 'logs');
const LOCALIZATION_FOLDER = isDev ? path.resolve(sourcePath, '..', 'localization') : path.resolve(process.resourcesPath, '..', 'localization');

export { REACT_PATH, TIDDLYWIKI_TEMPLATE_FOLDER_PATH, TIDDLERS_PATH, ICON_PATH, CHROME_ERROR_PATH, DESKTOP_PATH, LOG_FOLDER, LOCALIZATION_FOLDER };
