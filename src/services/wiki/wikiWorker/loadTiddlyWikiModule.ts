import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'path';
import semver from 'semver';

interface TiddlyWikiPackageManifest {
  main: string;
  name: string;
  version: string;
}

function readTiddlyWikiManifest(packagePath: string): TiddlyWikiPackageManifest {
  const manifestPath = path.join(packagePath, 'package.json');
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Unable to read the TiddlyWiki package manifest at ${manifestPath}`, { cause: error });
  }
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`Invalid TiddlyWiki package manifest at ${manifestPath}: expected an object`);
  }
  const candidate = manifest as Partial<TiddlyWikiPackageManifest>;
  if (candidate.name !== 'tiddlywiki') {
    throw new Error(`Invalid TiddlyWiki package manifest at ${manifestPath}: expected package name "tiddlywiki"`);
  }
  if (typeof candidate.version !== 'string' || semver.valid(candidate.version) === null) {
    throw new Error(`Invalid TiddlyWiki package manifest at ${manifestPath}: expected a semantic version`);
  }
  if (typeof candidate.main !== 'string' || candidate.main.length === 0) {
    throw new Error(`Invalid TiddlyWiki package manifest at ${manifestPath}: expected a CommonJS main entry`);
  }
  return candidate as TiddlyWikiPackageManifest;
}

export function authTokenIsProvided(providedToken: string | undefined): providedToken is string {
  return typeof providedToken === 'string' && providedToken.length > 0;
}

/**
 * Load the exact TiddlyWiki CommonJS entry selected by the host. A package may
 * be wiki-local or copied to Resources/node_modules in a packaged application.
 *
 * Do not use ESM directory import here. Node's ESM resolver can repeatedly scan
 * package directories when it is called from an Electron UtilityProcess and the
 * target package lives outside app.asar. TiddlyWiki publishes a CommonJS boot
 * entry, so resolve that entry from its installed manifest and load it through
 * the UtilityProcess CJS host instead.
 */
export async function loadTiddlyWikiModule(TIDDLY_WIKI_BOOT_PATH: string, onPhase?: (phase: string) => void) {
  const bootPath = path.resolve(TIDDLY_WIKI_BOOT_PATH);
  const packagePath = path.dirname(bootPath);
  const manifestPath = path.join(packagePath, 'package.json');
  const manifest = readTiddlyWikiManifest(packagePath);
  const packageRequire = createRequire(manifestPath);
  const entryPath = packageRequire.resolve(manifest.main);
  onPhase?.('entry-resolved');
  // require.resolve canonicalizes symlinks (notably /var -> /private/var on
  // macOS), so compare canonical paths on both sides of the package boundary.
  const canonicalPackagePath = realpathSync(packagePath);
  const canonicalEntryPath = realpathSync(entryPath);
  const relativeEntryPath = path.relative(canonicalPackagePath, canonicalEntryPath);
  if (relativeEntryPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeEntryPath)) {
    throw new Error(`Invalid TiddlyWiki package manifest at ${manifestPath}: main entry is outside the package directory`);
  }
  const expectedBootEntryPath = path.join(bootPath, 'boot.js');
  if (canonicalEntryPath !== realpathSync(expectedBootEntryPath)) {
    throw new Error(`Invalid TiddlyWiki package manifest at ${manifestPath}: main entry must resolve to ${expectedBootEntryPath}`);
  }
  onPhase?.('require-begin');
  const loadedModule = packageRequire(entryPath) as unknown;
  onPhase?.('require-end');
  if (typeof loadedModule !== 'object' || loadedModule === null || typeof (loadedModule as { TiddlyWiki?: unknown }).TiddlyWiki !== 'function') {
    throw new Error(`Invalid TiddlyWiki module at ${entryPath}: expected a TiddlyWiki function export`);
  }
  return loadedModule as typeof import('tiddlywiki');
}
