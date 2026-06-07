/**
 * Copy necessary dependencies after packaging
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
import fs from 'fs-extra';
import path from 'path';

// Packages whose absence makes the app non-functional at runtime.
// If any of these fail to copy, packaging itself should fail so that the
// problem is caught before deployment, not discovered by a user crash.
const CRITICAL_PACKAGES = ['tiddlywiki', 'better-sqlite3', 'nsfw', 'dugite'];

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
 * Running afterPack hook
 * Note: This must be a non-async function that accepts a callback for Electron Packager compatibility
 * @param buildPath /var/folders/qj/7j0zx32d0l75zmnrl1w3m3b80000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64/Electron.app/Contents/Resources/app
 * @param electronVersion 12.0.6
 * @param platform darwin / win32 (even on win11 x64)
 * @param arch x64
 * @param callback Callback to signal completion, receives Error if critical deps missing
 */
export default (
  buildPath: string,
  _electronVersion: string,
  platform: string,
  arch: string,
  callback: (error?: Error) => void,
): void => {
  const failures = new Set<string>();
  let unexpectedError: unknown = null;

  try {
    const cwd = path.resolve(buildPath, '..');
    const projectRoot = path.resolve(__dirname, '..');

    console.log('Copy npm packages with node-worker dependencies with binary (dugite) or __filename usages (tiddlywiki), which cannot be prepared properly by webpack');

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

      const packagePathsToCopyDereferenced: Array<{ segments: string[]; critical: string | null }> = [
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
        // node binary
        { segments: ['better-sqlite3', 'build', 'Release', 'better_sqlite3.node'], critical: 'better-sqlite3' },
        // nsfw native module
        { segments: ['nsfw', 'build', 'Release', 'nsfw.node'], critical: 'nsfw' },
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
      for (const { segments, critical } of packagePathsToCopyDereferenced) {
        const source = path.resolve(sourceNodeModulesFolder, ...segments);
        const destination = path.resolve(cwd, 'node_modules', ...segments);
        const criticalPackage = critical ?? segments[0];
        // some binary may not exist in other platforms, so allow failing for non-critical packages
        if (critical === null) {
          try {
            fs.copySync(source, destination, { dereference: true });
          } catch {
            // non-critical, platform-specific binary may not exist — allowed to fail silently
          }
        } else {
          copyWithTracking(source, destination, { dereference: true }, criticalPackage, failures);
        }
      }

      // MCP SDK — non-critical
      console.log('Copy @modelcontextprotocol/sdk');
      try {
        fs.copySync(
          path.join(sourceNodeModulesFolder, '@modelcontextprotocol', 'sdk'),
          path.join(cwd, 'node_modules', '@modelcontextprotocol', 'sdk'),
          { dereference: true },
        );
      } catch (error) {
        console.error(`Error copying @modelcontextprotocol/sdk: ${error instanceof Error ? error.message : String(error)}`);
      }

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
  } finally {
    // Report critical copy failures first — they have the most actionable diagnostics.
    // Fall back to any unexpected hook error so the overall packaging fails fast
    // instead of silently producing a corrupted build.
    const missingCritical = [...failures].filter(package_ => CRITICAL_PACKAGES.includes(package_));
    if (missingCritical.length > 0) {
      const error = new Error(
        `afterPack: critical dependencies failed to copy: ${missingCritical.join(', ')}. ` +
          `The packaged app will crash at runtime. Check build logs for details.`,
      );
      console.error(error.message);
      callback(error);
    } else if (unexpectedError !== null) {
      let error: Error;
      if (unexpectedError instanceof Error) {
        error = unexpectedError;
      } else if (typeof unexpectedError === 'string') {
        error = new Error(unexpectedError);
      } else {
        error = new Error(JSON.stringify(unexpectedError));
      }
      callback(error);
    } else {
      callback();
    }
  }
};
