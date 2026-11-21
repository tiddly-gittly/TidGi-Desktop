/**
 * Copy necessary dependencies after packaging
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
import fs from 'fs-extra';
import { findPackageJSON } from 'node:module';
import path from 'path';

// Packages whose absence makes the app non-functional at runtime.
// If any of these fail to copy, packaging itself should fail so that the
// problem is caught before deployment, not discovered by a user crash.
const CRITICAL_PACKAGES = [
  'tiddlywiki',
  'better-sqlite3',
  'nsfw',
  'dugite',
];

interface PackageJsonWithDependencies {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/**
 * Resolve a package root with Node's package-aware resolver.
 *
 * `findPackageJSON` understands scoped packages, package `exports`, pnpm's
 * nested layout, and platform path rules. Passing the parent package.json as
 * the base keeps resolution anchored to the package that declares the
 * dependency instead of assuming that every dependency was hoisted.
 */
function resolvePackageDirectory(packageName: string, fromFolder: string): string {
  const packageJsonPath = findPackageJSON(packageName, path.join(fromFolder, 'package.json'));
  if (!packageJsonPath) throw new Error(`Missing package.json for ${packageName}`);
  return path.dirname(packageJsonPath);
}

function copyWithTracking(
  source: string,
  destination: string,
  options: fs.CopyOptionsSync,
  criticalPackage: string,
  failures: Set<string>,
): void {
  try {
    fs.copySync(source, destination, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error copying ${source} → ${destination}: ${errorMessage}`);
    failures.add(criticalPackage);
  }
}

/**
 * Restore one Vite-externalized package and its installed runtime dependency
 * closure after Electron Packager has pruned the staging directory.
 *
 * A full `pnpm deploy` would stage every production dependency and duplicate
 * Forge/Vite's normal packaging work. This targeted traversal instead follows
 * Node's resolver from each parent package and copies only the externals that
 * cannot be bundled safely. Regular dependencies are required. Installed
 * optional dependencies are copied and become required once selected, while
 * optional dependencies that are absent for the current OS/CPU are skipped.
 * Reuse a copied dependency only when Node can resolve that exact source from
 * its parent. Conflicting versions belong in the parent's node_modules.
 */
export function copyPackageDependencyClosure(
  packageName: string,
  resolutionBaseFolder: string,
  destinationNodeModulesFolder: string,
  copiedPackages: Map<string, string> = new Map(),
  optional = false,
  parentDestination?: string,
): void {
  const packageSegments = packageName.split('/');
  let source: string;
  try {
    source = resolvePackageDirectory(packageName, resolutionBaseFolder);
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') return;
    throw error;
  }
  let destination = path.resolve(destinationNodeModulesFolder, ...packageSegments);
  if (parentDestination) {
    let ancestor = parentDestination;
    while (true) {
      const ancestorDependency = path.join(ancestor, 'node_modules', ...packageSegments);
      const copiedSource = copiedPackages.get(ancestorDependency);
      if (copiedSource) {
        if (copiedSource === source) return;
        destination = path.join(parentDestination, 'node_modules', ...packageSegments);
        break;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
  }
  if (copiedPackages.get(destination) === source) return;
  copiedPackages.set(destination, source);
  fs.copySync(
    source,
    destination,
    {
      dereference: true,
      // Dependencies are resolved individually; copying a nested node_modules
      // wholesale would also include development and unrelated optional packages.
      filter: file => path.relative(source, file).split(path.sep)[0] !== 'node_modules',
    },
  );

  const packageJson = fs.readJsonSync(path.join(source, 'package.json')) as PackageJsonWithDependencies;
  const runtimeDependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies };

  for (const dependencyName of Object.keys(runtimeDependencies)) {
    copyPackageDependencyClosure(
      dependencyName,
      source,
      destinationNodeModulesFolder,
      copiedPackages,
      Object.hasOwn(packageJson.optionalDependencies ?? {}, dependencyName),
      destination,
    );
  }
}

/**
 * Running afterPack hook
 * @param buildPath /var/folders/qj/7j0zx32d0l75zmnrl1w3m3b80000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64/Electron.app/Contents/Resources/app
 * @param electronVersion 12.0.6
 * @param platform darwin / win32 (even on win11 x64)
 * @param arch x64
 */
export default async (
  _forgeConfig: unknown,
  buildPath: string,
  _electronVersion: string,
  platform: string,
  arch: string,
): Promise<void> => {
  const failures = new Set<string>();
  const copiedPackages = new Map<string, string>();
  let unexpectedError: unknown = null;

  try {
    const cwd = path.resolve(buildPath, '..');
    const projectRoot = path.resolve(__dirname, '..');

    console.log('Copy npm packages with utility process dependencies with binary (dugite) or __filename usages (tiddlywiki), which cannot be prepared properly by webpack');

    if (['production', 'test'].includes(process.env.NODE_ENV ?? '')) {
      console.log('Copying tiddlywiki dependency to dist');
      const sourceNodeModulesFolder = path.resolve(projectRoot, 'node_modules');

      // zx — non-critical
      try {
        fs.copySync(
          path.join(sourceNodeModulesFolder, 'zx'),
          path.join(cwd, 'node_modules', 'zx'),
          { dereference: true },
        );
      } catch (error) {
        console.error(`Error copying zx to dist: ${error instanceof Error ? error.message : String(error)}`);
      }

      const packagePathsToCopyDereferenced: Array<{ segments: string[]; critical: string | null; dereference?: boolean }> = [
        { segments: ['tiddlywiki', 'package.json'], critical: 'tiddlywiki' },
        { segments: ['tiddlywiki', 'boot'], critical: 'tiddlywiki' },
        { segments: ['tiddlywiki', 'core'], critical: 'tiddlywiki' },
        // core-server: introduced in TiddlyWiki 5.4.0, contains Commander module ($tw.Commander) required by load-modules startup
        { segments: ['tiddlywiki', 'core-server'], critical: 'tiddlywiki' },
        // only copy plugins that is used in src/services/wiki/wikiWorker/startNodeJSWiki.ts, other plugins can be installed via JSON from online plugin library
        { segments: ['tiddlywiki', 'plugins', 'linonetwo'], critical: 'tiddlywiki' },
        { segments: ['tiddlywiki', 'plugins', 'tiddlywiki', 'filesystem'], critical: 'tiddlywiki' },
        { segments: ['tiddlywiki', 'plugins', 'tiddlywiki', 'tiddlyweb'], critical: 'tiddlywiki' },
        { segments: ['tiddlywiki', 'tiddlywiki.js'], critical: 'tiddlywiki' },
        { segments: ['better-sqlite3', 'package.json'], critical: 'better-sqlite3' },
        { segments: ['better-sqlite3', 'lib'], critical: 'better-sqlite3' },
        // nsfw native module
        { segments: ['nsfw', 'build', 'Release', 'nsfw.node'], critical: 'nsfw' },
        // rotating-file-stream: pure ESM, external for Node.js native require().
        // Only need the CJS dist + package.json for export resolution.
        { segments: ['rotating-file-stream', 'package.json'], critical: null },
        { segments: ['rotating-file-stream', 'dist', 'cjs', 'index.js'], critical: null },
        { segments: ['rotating-file-stream', 'dist', 'cjs', 'package.json'], critical: null },
        // sqlite-vec: non-critical vector search extension
        { segments: ['sqlite-vec', 'package.json'], critical: null },
        { segments: ['sqlite-vec', 'index.cjs'], critical: null },
        { segments: [`sqlite-vec-${platform === 'win32' ? 'windows' : platform}-${arch}`], critical: null },
      ];

      // macOS only: copy app-path binary for finding apps (non-critical)
      if (platform === 'darwin') {
        packagePathsToCopyDereferenced.push({ segments: ['app-path', 'main'], critical: null });
      }

      console.log('Copying packagePathsToCopyDereferenced');
      for (const { segments, critical, dereference = true } of packagePathsToCopyDereferenced) {
        const source = path.resolve(sourceNodeModulesFolder, ...segments);
        const destination = path.resolve(cwd, 'node_modules', ...segments);
        const criticalPackage = critical ?? segments[0];
        const copyOptions = { dereference };
        // some binary may not exist in other platforms, so allow failing for non-critical packages
        if (critical === null) {
          try {
            fs.copySync(source, destination, copyOptions);
          } catch {
            // non-critical, platform-specific binary may not exist — allowed to fail silently
          }
        } else {
          copyWithTracking(source, destination, copyOptions, criticalPackage, failures);
        }
      }

      // better-sqlite3 v13 can use either an Electron source build (CI removes
      // prebuilds before electron-rebuild) or its N-API prebuilds (local
      // installs). Copy whichever usable representation is present.
      const betterSqliteBuild = path.join(sourceNodeModulesFolder, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
      if (fs.existsSync(betterSqliteBuild)) {
        copyWithTracking(
          betterSqliteBuild,
          path.join(cwd, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
          { dereference: true },
          'better-sqlite3',
          failures,
        );
      } else {
        copyWithTracking(
          path.join(sourceNodeModulesFolder, 'better-sqlite3', 'prebuilds'),
          path.join(cwd, 'node_modules', 'better-sqlite3', 'prebuilds'),
          { dereference: true },
          'better-sqlite3',
          failures,
        );
      }

      console.log('Copy typeorm dependency closure');
      copyPackageDependencyClosure(
        'typeorm',
        sourceNodeModulesFolder,
        path.join(cwd, 'node_modules'),
        copiedPackages,
      );

      // electron-unhandled is pure ESM and remains external to the Vite main
      // bundle. Electron must resolve it, and all of its transitive runtime
      // dependencies, from Resources/node_modules at application startup.
      console.log('Copy electron-unhandled dependency closure');
      copyPackageDependencyClosure(
        'electron-unhandled',
        sourceNodeModulesFolder,
        path.join(cwd, 'node_modules'),
        copiedPackages,
      );

      // MCP SDK remains external to the Vite main bundle. Copy its complete
      // runtime dependency closure: recent releases load zod/v3 during module
      // initialization, before any MCP server is configured.
      console.log('Copy @modelcontextprotocol/sdk dependency closure');
      copyPackageDependencyClosure(
        '@modelcontextprotocol/sdk',
        sourceNodeModulesFolder,
        path.join(cwd, 'node_modules'),
        copiedPackages,
      );
      // dugite — critical (git operations)
      // it has things like `git/bin/libexec/git-core/git-add` link to `git/bin/libexec/git-core/git`, to reduce size, so can't use `dereference: true, recursive: true` here.
      console.log('Copy dugite');
      copyWithTracking(
        path.join(sourceNodeModulesFolder, 'dugite'),
        path.join(cwd, 'node_modules', 'dugite'),
        { dereference: false },
        'dugite',
        failures,
      );

      if (platform === 'win32') {
        console.log('Copy registry-js (Windows only)');
        // registry-js has native binary that is loaded using relative path (../../build/Release/registry.node)
        try {
          fs.copySync(
            path.join(sourceNodeModulesFolder, 'registry-js'),
            path.join(cwd, 'node_modules', 'registry-js'),
            { dereference: true },
          );
        } catch (error) {
          console.error(`Error copying registry-js: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } catch (error) {
    unexpectedError = error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Unexpected error in afterPack hook: ${errorMessage}`);
  }

  // Collect errors from the try block and throw if anything critical failed.
  let postError: Error | null = null;
  const missingCritical = [...failures].filter(package_ => CRITICAL_PACKAGES.includes(package_));
  if (missingCritical.length > 0) {
    postError = new Error(
      `afterPack: critical dependencies failed to copy: ${missingCritical.join(', ')}. ` +
        `The packaged app will crash at runtime. Check build logs for details.`,
    );
    console.error(postError.message);
  } else if (unexpectedError !== null) {
    if (unexpectedError instanceof Error) {
      postError = unexpectedError;
    } else if (typeof unexpectedError === 'string') {
      postError = new Error(unexpectedError);
    } else {
      postError = new Error(JSON.stringify(unexpectedError));
    }
  }
  if (postError !== null) {
    throw postError;
  }
};
