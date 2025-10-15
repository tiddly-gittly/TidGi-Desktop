import os from 'os';
import path from 'path';
import { isMac } from '../helpers/system';
import { isDevelopmentOrTest, isTest } from './environment';
import { developmentWikiFolderName, localizationFolderName, testWikiFolderName } from './fileNames';

/**
 * Environment Detection & Path Resolution Strategy
 *
 * Three execution environments:
 * 1. Development (pnpm start:dev) - Vite dev server
 * 2. Unit Tests (ELECTRON_RUN_AS_NODE=1) - Vitest with Electron
 * 3. Packaged (E2E/Production) - Built .asar file
 *
 * Key challenge: In unit tests, Electron sets process.resourcesPath to its internal directory,
 * which is wrong. We detect this by checking if the path contains 'electron'.
 */

// Detect if we're in packaged app (not dev, not unit tests with electron's internal path)
const isPackaged = process.resourcesPath && !process.resourcesPath.includes('electron');

// Project root directory (outside asar in packaged apps)
export const sourcePath = isPackaged
  ? path.resolve(process.resourcesPath, '..') // Packaged: go up from resources/ to app root
  : path.resolve(__dirname, '..', '..'); // Dev/Unit test: from src/constants to project root
// Build resources (only used in dev/test)
// In dev the `sourcePath` already points to project root, so join directly to `build-resources`.
export const buildResourcePath = path.resolve(sourcePath, 'build-resources');
export const developmentImageFolderPath = path.resolve(sourcePath, 'images');

// Menubar icon
const menuBarIconFileName = isMac ? 'menubarTemplate@2x.png' : 'menubar@2x.png';
export const MENUBAR_ICON_PATH = isPackaged
  ? path.resolve(process.resourcesPath, menuBarIconFileName) // Packaged: resources/<icon>
  : path.resolve(buildResourcePath, menuBarIconFileName); // Dev/Unit test: <project-root>/build-resources/<icon>

// System paths
export const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
export const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');

// Node modules base (for native binaries and external packages)
export const PACKAGE_PATH_BASE = isPackaged
  ? path.resolve(process.resourcesPath, 'node_modules') // Packaged: resources/node_modules
  : path.resolve(sourcePath, 'node_modules'); // Dev/Unit test: project/node_modules

// Package-specific paths
export const ZX_FOLDER = path.resolve(PACKAGE_PATH_BASE, 'zx', 'build', 'cli.js');
export const TIDDLYWIKI_PACKAGE_FOLDER = path.resolve(PACKAGE_PATH_BASE, 'tiddlywiki', 'boot');
export const SQLITE_BINARY_PATH = path.resolve(PACKAGE_PATH_BASE, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

// Localization folder
export const LOCALIZATION_FOLDER = isPackaged
  ? path.resolve(process.resourcesPath, localizationFolderName) // Packaged: resources/localization
  : path.resolve(sourcePath, localizationFolderName); // Dev/Unit test: project/localization

// Default wiki locations
// For E2E tests, always use project root's wiki-test (outside asar)
// process.resourcesPath: out/TidGi-.../resources -> need ../../.. to get to project root
export const DEFAULT_FIRST_WIKI_FOLDER_PATH = isTest && isPackaged
  ? path.resolve(process.resourcesPath, '..', '..', '..', testWikiFolderName) // E2E packaged: project root
  : isTest
  ? path.resolve(__dirname, '..', '..', testWikiFolderName) // E2E dev: project root
  : isDevelopmentOrTest
  ? path.resolve(sourcePath, developmentWikiFolderName) // Dev: use sourcePath
  : DESKTOP_PATH; // Production: use desktop
export const DEFAULT_FIRST_WIKI_NAME = 'wiki';
export const DEFAULT_FIRST_WIKI_PATH = path.join(DEFAULT_FIRST_WIKI_FOLDER_PATH, DEFAULT_FIRST_WIKI_NAME);
// TiddlyWiki template folder
export const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isPackaged
  ? path.resolve(process.resourcesPath, 'wiki') // Packaged: resources/wiki
  : path.resolve(sourcePath, 'template', 'wiki'); // Dev/Unit test: project/template/wiki
export const TIDDLERS_PATH = 'tiddlers';
