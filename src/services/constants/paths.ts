import { app } from 'electron';
import path from 'path';
import os from 'os';
import { isDevelopmentOrTest } from '@/constants/environment';
import { developmentSettingFolderName, localizationFolderName } from '@/constants/fileNames';

const isMac = process.platform === 'darwin';

/** src folder */
const sourcePath = path.resolve(__dirname, '..', '..');
export const buildResourcePath = path.resolve(sourcePath, '..', 'build-resources');

const REACT_PATH = MAIN_WINDOW_WEBPACK_ENTRY;
// .app/Contents/Resources/wiki/
const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', 'template', 'wiki')
  : path.resolve(process.resourcesPath, '..', 'wiki');
const TIDDLERS_PATH = 'tiddlers';
const ICON_PATH = isDevelopmentOrTest ? path.resolve(buildResourcePath, 'icon.png') : `file://${path.resolve(__dirname, '..', 'icon.png')}`;
const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
const LOGIN_REDIRECT_PATH = 'http://localhost:3000/?code=';
const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
const LOG_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', 'logs')
  : isMac
  ? path.resolve(process.resourcesPath, '..', 'logs')
  : path.resolve(os.homedir(), '.tg-note', 'logs');
const SETTINGS_FOLDER = isDevelopmentOrTest ? path.resolve(sourcePath, '..', developmentSettingFolderName) : path.resolve(app.getPath('userData'), 'settings');
const LOCALIZATION_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', localizationFolderName)
  : path.resolve(process.resourcesPath, localizationFolderName);

export {
  REACT_PATH,
  TIDDLYWIKI_TEMPLATE_FOLDER_PATH,
  TIDDLERS_PATH,
  ICON_PATH,
  CHROME_ERROR_PATH,
  LOGIN_REDIRECT_PATH,
  DESKTOP_PATH,
  LOG_FOLDER,
  SETTINGS_FOLDER,
  LOCALIZATION_FOLDER,
};
