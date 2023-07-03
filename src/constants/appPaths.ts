import { app } from 'electron';
import path from 'path';
import { __TEST__ as v8CompileCacheLibrary } from 'v8-compile-cache-lib';
import { isDevelopmentOrTest } from './environment';
import { cacheDatabaseFolderName, httpsCertKeyFolderName, languageModelFolderName, settingFolderName } from './fileNames';
import { sourcePath } from './paths';

export const USER_DATA_FOLDER = app.getPath('userData');
export const SETTINGS_FOLDER = isDevelopmentOrTest
  /** Used to store settings during dev and testing */
  ? path.resolve(sourcePath, '..', `${settingFolderName}-dev`)
  : path.resolve(USER_DATA_FOLDER, settingFolderName);
export const HTTPS_CERT_KEY_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', `${httpsCertKeyFolderName}-dev`)
  : path.resolve(USER_DATA_FOLDER, httpsCertKeyFolderName);
export const CACHE_DATABASE_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', `${cacheDatabaseFolderName}-dev`)
  : path.resolve(USER_DATA_FOLDER, cacheDatabaseFolderName);
export const LANGUAGE_MODEL_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', `${languageModelFolderName}-dev`)
  : path.resolve(USER_DATA_FOLDER, languageModelFolderName);
export const LOCAL_GIT_DIRECTORY = path.resolve(isDevelopmentOrTest ? path.join(sourcePath, '..') : process.resourcesPath, 'node_modules', 'dugite', 'git');
export const LOG_FOLDER = isDevelopmentOrTest ? path.resolve(sourcePath, '..', 'logs') : path.resolve(USER_DATA_FOLDER, 'logs');
export const V8_CACHE_FOLDER = v8CompileCacheLibrary.getCacheDir();
export const DEFAULT_DOWNLOADS_PATH = path.join(app.getPath('home'), 'Downloads');
