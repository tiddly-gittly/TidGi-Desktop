import { app } from 'electron';
import path from 'path';
import { __TEST__ as v8CompileCacheLibrary } from 'v8-compile-cache-lib';
import { isDevelopmentOrTest } from './environment';
import { httpsCertKeyFolderName, settingFolderName } from './fileNames';
import { sourcePath } from './paths';

// in dev mode, set userData to a different folder, so gotTheLock will be true, we can run dev instance and normal instance.
if (isDevelopmentOrTest) {
  app.setPath('userData', path.resolve(sourcePath, '..', 'userData-dev'));
}
export const USER_DATA_FOLDER = app.getPath('userData');
export const SETTINGS_FOLDER = path.resolve(USER_DATA_FOLDER, settingFolderName);
export const HTTPS_CERT_KEY_FOLDER = path.resolve(USER_DATA_FOLDER, httpsCertKeyFolderName);
export const LOCAL_GIT_DIRECTORY = path.resolve(isDevelopmentOrTest ? path.join(sourcePath, '..') : process.resourcesPath, 'node_modules', 'dugite', 'git');
export const LOG_FOLDER = path.resolve(USER_DATA_FOLDER, 'logs');
export const V8_CACHE_FOLDER = v8CompileCacheLibrary.getCacheDir();
export const DEFAULT_DOWNLOADS_PATH = path.join(app.getPath('home'), 'Downloads');
