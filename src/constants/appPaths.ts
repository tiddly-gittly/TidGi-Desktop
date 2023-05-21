import { app } from 'electron';
import path from 'path';
import { __TEST__ as v8CompileCacheLibrary } from 'v8-compile-cache-lib';
import { isDevelopmentOrTest } from './environment';
import { developmentSettingFolderName } from './fileNames';
import { sourcePath } from './paths';

export const USER_DATA_FOLDER = app.getPath('userData');
export const SETTINGS_FOLDER = isDevelopmentOrTest
  ? path.resolve(sourcePath, '..', developmentSettingFolderName)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  : path.resolve(USER_DATA_FOLDER, 'settings');
export const LOCAL_GIT_DIRECTORY = path.resolve(isDevelopmentOrTest ? path.join(sourcePath, '..') : process.resourcesPath, 'node_modules', 'dugite', 'git');
export const LOG_FOLDER = isDevelopmentOrTest ? path.resolve(sourcePath, '..', 'logs') : path.resolve(USER_DATA_FOLDER, 'logs');
export const V8_CACHE_FOLDER = v8CompileCacheLibrary.getCacheDir();
export const DEFAULT_DOWNLOADS_PATH = path.join(app.getPath('home'), 'Downloads');
