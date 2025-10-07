import { app } from 'electron';
import path from 'path';
import { __TEST__ as v8CompileCacheLibrary } from 'v8-compile-cache-lib';
import { isElectronDevelopment, isTest } from './environment';
import { cacheDatabaseFolderName, httpsCertKeyFolderName, settingFolderName } from './fileNames';
import { sourcePath } from './paths';

/**
 * Application Path Configuration
 *
 * Sets up isolated userData directories for different environments:
 * - Test: userData-test/ (isolated from dev/prod)
 * - Development: userData-dev/ (isolated from production)
 * - Production: system default userData directory
 */

// Detect if we're in packaged app (E2E tests use packaged app with NODE_ENV=test)
const isPackaged = process.resourcesPath && !process.resourcesPath.includes('electron');

// Set isolated userData paths for dev/test
if (isTest) {
  const userDataPath = isPackaged
    ? path.resolve(process.cwd(), 'userData-test') // E2E: packaged, use cwd (outside asar)
    : path.resolve(sourcePath, 'userData-test'); // Unit tests: project/userData-test
  app.setPath('userData', userDataPath);
} else if (isElectronDevelopment) {
  app.setPath('userData', path.resolve(sourcePath, 'userData-dev'));
}

// Application directories
export const USER_DATA_FOLDER = app.getPath('userData');
export const SETTINGS_FOLDER = path.resolve(USER_DATA_FOLDER, settingFolderName);
export const HTTPS_CERT_KEY_FOLDER = path.resolve(USER_DATA_FOLDER, httpsCertKeyFolderName);
export const CACHE_DATABASE_FOLDER = path.resolve(USER_DATA_FOLDER, cacheDatabaseFolderName);

// Git directory (dugite package location)
export const LOCAL_GIT_DIRECTORY = isPackaged
  ? path.resolve(process.resourcesPath, 'node_modules', 'dugite', 'git')
  : path.resolve(sourcePath, 'node_modules', 'dugite', 'git');
// Logging and cache directories
export const LOG_FOLDER = path.resolve(USER_DATA_FOLDER, 'logs');
export const V8_CACHE_FOLDER = v8CompileCacheLibrary.getCacheDir();
export const DEFAULT_DOWNLOADS_PATH = path.join(app.getPath('home'), 'Downloads');
