import { existsSync } from 'fs';
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
 *
 * WARNING: process.resourcesPath changes during app initialization!
 * When starting via protocol (tidgi://), this path may not be correct initially.
 * Always access language maps via ContextService after app initialization.
 * See issue #625 for details.
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

// TidGi Mini Window icon
const tidgiMiniWindowIconFileName = isMac ? 'tidgiMiniWindowTemplate@2x.png' : 'tidgiMiniWindow@2x.png';
export const TIDGI_MINI_WINDOW_ICON_PATH = isPackaged
  ? path.resolve(process.resourcesPath, tidgiMiniWindowIconFileName) // Packaged: resources/<icon>
  : path.resolve(buildResourcePath, tidgiMiniWindowIconFileName); // Dev/Unit test: <project-root>/build-resources/<icon>

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

/**
 * Check if a wiki folder has its own TiddlyWiki installation and return the appropriate boot path.
 * Prefers wiki-folder-local installation over the built-in version to support custom TW versions.
 *
 * @param wikiFolderLocation - The path to the wiki folder
 * @returns The path to TiddlyWiki boot folder (local if exists, otherwise built-in)
 */
export function getTiddlyWikiBootPath(wikiFolderLocation: string): string {
  const localTiddlyWikiBootPath = path.resolve(wikiFolderLocation, 'node_modules', 'tiddlywiki', 'boot');
  try {
    // Check if local TiddlyWiki exists synchronously since this is a critical path
    if (existsSync(localTiddlyWikiBootPath)) {
      return localTiddlyWikiBootPath;
    }
  } catch {
    // Fall through to use built-in version if check fails
  }
  return TIDDLYWIKI_PACKAGE_FOLDER;
}

// Localization folder
export const LOCALIZATION_FOLDER = isPackaged
  ? path.resolve(process.resourcesPath, localizationFolderName) // Packaged: resources/localization
  : path.resolve(sourcePath, localizationFolderName); // Dev/Unit test: project/localization

// Default wiki locations
// For E2E tests, always use project root's wiki-test (outside asar)
// Windows/Linux: process.resourcesPath = out/TidGi-.../resources -> need ../../.. (3 levels) to get to project root
// macOS: process.resourcesPath = out/TidGi-darwin-x64/TidGi.app/Contents/Resources -> need ../../../../../ (5 levels) to get to project root
export const DEFAULT_FIRST_WIKI_FOLDER_PATH = isTest && isPackaged
  ? (isMac
    ? path.resolve(process.resourcesPath, '..', '..', '..', '..', '..', testWikiFolderName) // macOS E2E: 5 levels up
    : path.resolve(process.resourcesPath, '..', '..', '..', testWikiFolderName)) // Windows/Linux E2E: 3 levels up
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
