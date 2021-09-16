import path from 'path';
import os from 'os';
import { isDevelopmentOrTest } from './environment';
import { developmentWikiFolderName, localizationFolderName } from './fileNames';

const isMac = process.platform === 'darwin';

/** src folder */
export const sourcePath = path.resolve(__dirname, '..');
export const buildResourcePath = path.resolve(sourcePath, '..', 'build-resources');
export const developmentImageFolderPath = path.resolve(sourcePath, 'images');

// .app/Contents/Resources/wiki/
export const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', 'template', 'wiki')
  : path.resolve(process.resourcesPath, 'wiki');
export const TIDDLERS_PATH = 'tiddlers';

const menuBarIconFileName = process.platform === 'darwin' ? 'menubarTemplate@2x.png' : 'menubar@2x.png';
export const MENUBAR_ICON_PATH = path.resolve(isDevelopmentOrTest ? buildResourcePath : process.resourcesPath, menuBarIconFileName);

export const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
export const LOGIN_REDIRECT_PATH = 'http://localhost:3000/?code=';
export const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
export const LOG_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', 'logs')
  : isMac
  ? path.resolve(process.resourcesPath, '..', 'logs')
  : path.resolve(os.homedir(), '.tg-note', 'logs');
export const ZX_FOLDER = isDevelopmentOrTest
  ? path.resolve(__dirname, '..', '..', 'node_modules', 'zx', 'zx.mjs')
  : path.resolve(process.resourcesPath, 'node_modules', 'zx', 'zx.mjs');
export const LOCALIZATION_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', localizationFolderName)
  : path.resolve(process.resourcesPath, localizationFolderName);
export const DEFAULT_WIKI_FOLDER = isDevelopmentOrTest ? path.resolve(os.tmpdir(), developmentWikiFolderName) : DESKTOP_PATH;
