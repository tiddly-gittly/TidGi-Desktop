import { app } from 'electron';
import path from 'path';
import { __TEST__ as v8CompileCacheLibrary } from 'v8-compile-cache-lib';
import { isDevelopmentOrTest, isElectronDevelopment, isTest } from './environment';
import { cacheDatabaseFolderName, httpsCertKeyFolderName, settingFolderName } from './fileNames';
import { sourcePath } from './paths';

/**
 * Application Path Configuration
 *
 * This module sets up different userData directories for different environments:
 * - Test: userData-test/ (isolated from dev/prod data)
 * - Development: userData-dev/ (isolated from production data)
 * - Production: default system userData directory
 *
 * In test environment, app.setPath() calls below rely on the electron mock
 * defined in src/__tests__/setup-vitest.ts to work correctly. The mock ensures that
 * setPath() actually stores path values and getPath() retrieves them, enabling proper
 * test isolation.
 */

// in dev/test mode, set userData to a different folder, so gotTheLock will be true, we can run dev instance and normal instance.
if (isTest) {
  app.setPath('userData', path.resolve(sourcePath, '..', 'userData-test'));
} else if (isElectronDevelopment) {
  app.setPath('userData', path.resolve(sourcePath, '..', 'userData-dev'));
}
export const USER_DATA_FOLDER = app.getPath('userData');
export const SETTINGS_FOLDER = path.resolve(USER_DATA_FOLDER, settingFolderName);
export const HTTPS_CERT_KEY_FOLDER = path.resolve(USER_DATA_FOLDER, httpsCertKeyFolderName);
export const LOCAL_GIT_DIRECTORY = path.resolve(isDevelopmentOrTest ? path.join(sourcePath, '..') : process.resourcesPath, 'node_modules', 'dugite', 'git');
export const LOG_FOLDER = path.resolve(USER_DATA_FOLDER, 'logs');
export const V8_CACHE_FOLDER = v8CompileCacheLibrary.getCacheDir();
export const DEFAULT_DOWNLOADS_PATH = path.join(app.getPath('home'), 'Downloads');
export const CACHE_DATABASE_FOLDER = path.resolve(USER_DATA_FOLDER, cacheDatabaseFolderName);
