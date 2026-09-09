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

// Linux window icons are not embedded in the executable. Keep the packaged path
// in sync with packagerConfig.extraResource in forge.config.ts.
export const TIDGI_APP_ICON_PATH = isPackaged
  ? path.resolve(process.resourcesPath, 'icon.png')
  : path.resolve(buildResourcePath, 'icon.png');

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
/**
 * Path to TidGi's built-in TiddlyWiki plugins (compiled by scripts/compilePlugins.mjs).
 * When wiki uses a local TiddlyWiki installation, we still need to load TidGi's custom plugins from here.
 */
export const TIDDLYWIKI_BUILT_IN_PLUGINS_PATH = path.resolve(PACKAGE_PATH_BASE, 'tiddlywiki', 'plugins');

/**
 * Resolve the native nsfw binary used by the bundled filesystem watcher.
 *
 * Keep this rooted at PACKAGE_PATH_BASE rather than a wiki's local
 * node_modules directory: afterPack copies the binary to the same
 * Resources/node_modules location used by packaged utility processes.
 */
export function resolveNsfwBinaryPath(packagePathBase: string): string {
  const normalizedBase = packagePathBase.trim();
  if (normalizedBase.length === 0) {
    throw new Error('Cannot resolve nsfw native binary without a package path base');
  }
  return path.resolve(normalizedBase, 'nsfw', 'build', 'Release', 'nsfw.node');
}

export const NSFW_BINARY_PATH = resolveNsfwBinaryPath(PACKAGE_PATH_BASE);

// better-sqlite3 v13+ uses prebuilt binaries in prebuilds/ instead of build/Release/
// Fallback to build/Release/ for older versions or electron-rebuild output
function getSqliteBinaryPath(): string {
  const prebuildDirectory = path.resolve(PACKAGE_PATH_BASE, 'better-sqlite3', 'prebuilds');
  let isMusl = false;
  if (process.platform === 'linux') {
    try {
      const report = process.report?.getReport?.() as { header?: { glibcVersionRuntime?: string } } | undefined;
      isMusl = !report?.header?.glibcVersionRuntime;
    } catch (error: unknown) {
      // `process.report.getReport()` is unavailable on a few embedded Node
      // builds. Keep the deterministic glibc path for that expected probe
      // failure, but do not hide unrelated thrown values.
      if (!(error instanceof Error)) throw error;
      isMusl = false;
    }
  }
  const platform = isMusl ? 'linuxmusl' : process.platform;
  const prebuiltPath = path.resolve(prebuildDirectory, `${platform}-${process.arch}.node`);
  if (existsSync(prebuiltPath)) {
    return prebuiltPath;
  }
  return path.resolve(PACKAGE_PATH_BASE, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
}

export const SQLITE_BINARY_PATH = getSqliteBinaryPath();

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
  } catch (error: unknown) {
    // `existsSync` only throws for an invalid path argument. A normal missing
    // local installation is represented by `false` above, so preserve that
    // fallback while surfacing unexpected failures.
    if (!(error instanceof TypeError)) throw error;
  }
  return TIDDLYWIKI_PACKAGE_FOLDER;
}

// Localization folder
export const LOCALIZATION_FOLDER = isPackaged
  ? path.resolve(process.resourcesPath, localizationFolderName) // Packaged: resources/localization
  : path.resolve(sourcePath, localizationFolderName); // Dev/Unit test: project/localization

// Default wiki locations. Packaged test runs must provide their scenario via
// the environment so every run gets an isolated workspace root.

/**
 * Parse the test scenario identifier from the environment variable.
 * On Windows Electron rejects custom CLI flags, so E2E tests pass
 * TIDGI_TEST_SCENARIO via env.
 * Note: Cannot import slugify from helpers due to circular dependency,
 * so we use a local version. Consider restructuring imports if this becomes problematic.
 */
function getTestScenarioSlugForWiki(): string | undefined {
  // Use bracket notation to prevent Vite/esbuild from stripping the runtime env var.
  const environmentScenario = process.env['TIDGI_TEST_SCENARIO'];
  if (environmentScenario) {
    let s = environmentScenario.normalize('NFKC');
    s = s.replace(/\./g, '');
    let slug = s.replace(/[^\p{L}\p{N}\s\-_()]/gu, '-');
    slug = slug.replace(/-+/g, '-');
    slug = slug.replace(/\s+/g, ' ').trim();
    slug = slug.replace(/^-+|-+$/g, '').replace(/^[\s]+|[\s]+$/g, '');
    if (slug.length > 60) slug = slug.substring(0, 60).trim();
    slug = slug.replace(/[-\s]+$/g, '');
    return slug || undefined;
  }

  return undefined;
}

const TEST_SCENARIO_SLUG_WIKI = getTestScenarioSlugForWiki();

export const DEFAULT_FIRST_WIKI_FOLDER_PATH = (() => {
  if (isTest && isPackaged) {
    const scenarioSlug = TEST_SCENARIO_SLUG_WIKI;
    if (scenarioSlug === undefined) {
      throw new Error('TIDGI_TEST_SCENARIO is required for packaged test runs');
    }
    return path.resolve(process.cwd(), 'test-artifacts', scenarioSlug, testWikiFolderName);
  }
  if (isTest) return path.resolve(__dirname, '..', '..', testWikiFolderName);
  if (isDevelopmentOrTest) return path.resolve(sourcePath, developmentWikiFolderName);
  return DESKTOP_PATH;
})();
export const DEFAULT_FIRST_WIKI_NAME = 'wiki';
export const DEFAULT_FIRST_WIKI_PATH = path.join(DEFAULT_FIRST_WIKI_FOLDER_PATH, DEFAULT_FIRST_WIKI_NAME);
// TiddlyWiki template folder
export const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isPackaged
  ? path.resolve(process.resourcesPath, 'wiki') // Packaged: resources/wiki
  : path.resolve(sourcePath, 'template', 'wiki'); // Dev/Unit test: project/template/wiki
export const TIDDLERS_PATH = 'tiddlers';
