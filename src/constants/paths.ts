import os from 'os';
import path from 'path';
import { isMac } from '../helpers/system';
import { isDevelopmentOrTest } from './environment';
import { developmentWikiFolderName, localizationFolderName } from './fileNames';

/** src folder */
export const sourcePath = path.resolve(__dirname, '..');
export const buildResourcePath = path.resolve(sourcePath, '..', 'build-resources');
export const developmentImageFolderPath = path.resolve(sourcePath, 'images');

// .app/Contents/Resources/wiki/
export const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', 'template', 'wiki')
  : path.resolve(process.resourcesPath, 'wiki');
export const TIDDLERS_PATH = 'tiddlers';

const menuBarIconFileName = isMac ? 'menubarTemplate@2x.png' : 'menubar@2x.png';
export const MENUBAR_ICON_PATH = path.resolve(isDevelopmentOrTest ? buildResourcePath : process.resourcesPath, menuBarIconFileName);

export const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
export const LOGIN_REDIRECT_PATH = 'http://localhost:3012/?code=';
export const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');

export const PACKAGE_PATH_BASE = isDevelopmentOrTest
  ? path.resolve(__dirname, '..', '..', 'node_modules')
  : path.resolve(process.resourcesPath, 'node_modules');
export const ZX_FOLDER = path.resolve(PACKAGE_PATH_BASE, 'zx', 'build', 'cli.js');
export const TIDDLYWIKI_PACKAGE_FOLDER = path.resolve(PACKAGE_PATH_BASE, '@tiddlygit', 'tiddlywiki', 'boot');
export const SQLITE_BINARY_PATH = path.resolve(PACKAGE_PATH_BASE, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
export const RWKV_CPP_TOKENIZER_PATH = path.resolve(PACKAGE_PATH_BASE, 'llama-node', '20B_tokenizer.json');

export const LOCALIZATION_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', localizationFolderName)
  : path.resolve(process.resourcesPath, localizationFolderName);
export const DEFAULT_WIKI_FOLDER = isDevelopmentOrTest ? path.resolve(os.tmpdir(), developmentWikiFolderName) : DESKTOP_PATH;
export const DEFAULT_FIRST_WIKI_NAME = 'wiki';
export const DEFAULT_FIRST_WIKI_PATH = path.join(DEFAULT_WIKI_FOLDER, DEFAULT_FIRST_WIKI_NAME);
