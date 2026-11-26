import { app } from 'electron';
import path from 'path';
import { __TEST__ as v8CompileCacheLibrary } from 'v8-compile-cache-lib';
import { slugify } from '../helpers/slugify';
import { isElectronDevelopment, isTest } from './environment';
import { cacheDatabaseFolderName, httpsCertKeyFolderName, settingFolderName } from './fileNames';
import { DEFAULT_FIRST_WIKI_FOLDER_PATH as PATHS_DEFAULT_FIRST_WIKI_FOLDER_PATH, DEFAULT_FIRST_WIKI_NAME, sourcePath } from './paths';

/**
 * Application Path Configuration
 *
 * Sets up isolated userData directories for different environments:
 * - Packaged tests with TIDGI_TEST_SCENARIO: test-artifacts/{scenarioSlug}/userData-test (scenario-isolated)
 * - Unit tests: userData-test/ (isolated from dev/prod)
 * - Development: userData-dev/ (isolated from production)
 * - Production: system default userData directory
 */

// Detect if we're in packaged app (E2E tests use packaged app with NODE_ENV=test)
const isPackaged = process.resourcesPath && !process.resourcesPath.includes('electron');

/**
 * Parse the test scenario identifier supplied by the E2E harness.
 * Packaged test runs must provide this environment value so each run gets an
 * isolated user-data directory.
 */
function getTestScenarioSlug(): string | undefined {
  // Use bracket notation to prevent Vite/esbuild from stripping the runtime env var.
  const environmentScenario = process.env['TIDGI_TEST_SCENARIO'];
  if (!environmentScenario) return undefined;
  const slug = slugify(environmentScenario, 60);
  return slug === 'unknown' ? undefined : slug;
}

export const TEST_SCENARIO_SLUG = getTestScenarioSlug();

// Set isolated userData paths for dev/test
if (isTest) {
  let userDataPath: string;
  if (isPackaged) {
    if (!TEST_SCENARIO_SLUG) {
      throw new Error('TIDGI_TEST_SCENARIO is required for packaged test runs');
    }
    userDataPath = path.resolve(process.cwd(), 'test-artifacts', TEST_SCENARIO_SLUG, 'userData-test');
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
// Logging, installer, and cache directories
export const LOG_FOLDER = path.resolve(USER_DATA_FOLDER, 'logs');
/**
 * Folder that holds installer / package-manager logs.
 * - Windows: SquirrelTemp (Setup / Update.exe)
 * - macOS / Linux: /var/log (install.log, dpkg.log, etc.; zip/dmg drag-install has no dedicated app installer log)
 */
export const INSTALLER_LOG_FOLDER = (() => {
  switch (process.platform) {
    case 'win32': {
      return path.resolve(process.env.LOCALAPPDATA ?? path.join(app.getPath('home'), 'AppData', 'Local'), 'SquirrelTemp');
    }
    case 'darwin':
    case 'linux': {
      return '/var/log';
    }
    default: {
      return '';
    }
  }
})();
export const V8_CACHE_FOLDER = v8CompileCacheLibrary.getCacheDir();
export const DEFAULT_DOWNLOADS_PATH = path.join(app.getPath('home'), 'Downloads');

// Use Electron's app.getPath('desktop') which correctly resolves the Desktop folder even when it has
// been redirected (e.g. OneDrive Desktop sync on Windows). path.join(os.homedir(), 'Desktop') can
// point to a non-existent path in such environments and causes E-3 errors when creating a new wiki.
// For dev/test keep the paths.ts value (which has the proper test isolation logic).
export const DEFAULT_FIRST_WIKI_FOLDER_PATH = (isElectronDevelopment || isTest)
  ? PATHS_DEFAULT_FIRST_WIKI_FOLDER_PATH
  : app.getPath('desktop');
export const DEFAULT_FIRST_WIKI_PATH = path.join(DEFAULT_FIRST_WIKI_FOLDER_PATH, DEFAULT_FIRST_WIKI_NAME);
