import { app } from 'electron';
import path from 'path';
import os from 'os';
import { isDevelopmentOrTest } from '@/constants/environment';
import { developmentSettingFolderName, developmentWikiFolderName, localizationFolderName } from '@/constants/fileNames';

const isMac = process.platform === 'darwin';

/** src folder */
const sourcePath = path.resolve(__dirname, '..', '..');
export const buildResourcePath = path.resolve(sourcePath, '..', 'build-resources');

export const REACT_PATH = MAIN_WINDOW_WEBPACK_ENTRY;
// .app/Contents/Resources/wiki/
export const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', 'template', 'wiki')
  : path.resolve(process.resourcesPath, '..', 'wiki');
export const TIDDLERS_PATH = 'tiddlers';
export const ICON_PATH = isDevelopmentOrTest ? path.resolve(buildResourcePath, 'icon.png') : `file://${path.resolve(__dirname, '..', 'icon.png')}`;
export const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
export const LOGIN_REDIRECT_PATH = 'http://localhost:3000/?code=';
export const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
export const LOG_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', 'logs')
  : isMac
  ? path.resolve(process.resourcesPath, '..', 'logs')
  : path.resolve(os.homedir(), '.tg-note', 'logs');
export const SETTINGS_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', developmentSettingFolderName)
  : path.resolve(app.getPath('userData'), 'settings');
export const LOCALIZATION_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', localizationFolderName)
  : path.resolve(process.resourcesPath, localizationFolderName);
export const DEFAULT_WIKI_FOLDER = isDevelopmentOrTest ? path.resolve(sourcePath, '..', developmentWikiFolderName) : DESKTOP_PATH;
