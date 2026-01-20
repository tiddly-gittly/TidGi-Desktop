import { app } from 'electron';
import path from 'path';
import { __TEST__ as v8CompileCacheLibrary } from 'v8-compile-cache-lib';
import { slugify } from '../helpers/slugify';
import { isElectronDevelopment, isTest } from './environment';
import { cacheDatabaseFolderName, httpsCertKeyFolderName, settingFolderName } from './fileNames';
import { sourcePath } from './paths';

/**
 * Application Path Configuration
 *
 * Sets up isolated userData directories for different environments:
 * - Test with --test-scenario: test-artifacts/{scenarioSlug}/userData-test (scenario-isolated)
 * - Test without scenario: userData-test/ (legacy, isolated from dev/prod)
 * - Development: userData-dev/ (isolated from production)
 * - Production: system default userData directory
 */

// Detect if we're in packaged app (E2E tests use packaged app with NODE_ENV=test)
const isPackaged = process.resourcesPath && !process.resourcesPath.includes('electron');

/**
 * Parse --test-scenario=xxx argument from command line
 * This is used to isolate test data per scenario in E2E tests
 */
function getTestScenarioSlug(): string | undefined {
  const scenarioArgument = process.argv.find(argument => argument.startsWith('--test-scenario='));
  if (!scenarioArgument) return undefined;

  const rawName = scenarioArgument.split('=')[1];
  if (!rawName) return undefined;

  // Use shared slugify function for consistent behavior across codebase
  const slug = slugify(rawName, 60);
  return slug === 'unknown' ? undefined : slug;
}

export const TEST_SCENARIO_SLUG = getTestScenarioSlug();

// Set isolated userData paths for dev/test
if (isTest) {
  let userDataPath: string;
  if (TEST_SCENARIO_SLUG && isPackaged) {
    // E2E with scenario isolation: test-artifacts/{scenario}/userData-test
    userDataPath = path.resolve(process.cwd(), 'test-artifacts', TEST_SCENARIO_SLUG, 'userData-test');
  } else if (isPackaged) {
    // E2E without scenario (legacy): cwd/userData-test
    userDataPath = path.resolve(process.cwd(), 'userData-test');
  } else {
    // Unit tests: project/userData-test
    userDataPath = path.resolve(sourcePath, 'userData-test');
  }
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
