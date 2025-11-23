/**
 * Copy necessary dependencies after packaging
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
import fs from 'fs-extra';
import path from 'path';

/**
 * Running afterPack hook
 * Note: This must be a non-async function that accepts a callback for Electron Packager compatibility
 * @param buildPath /var/folders/qj/7j0zx32d0l75zmnrl1w3m3b80000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64/Electron.app/Contents/Resources/app
 * @param electronVersion 12.0.6
 * @param platform darwin / win32 (even on win11 x64)
 * @param arch x64
 * @param callback Callback to signal completion
 */
export default (
  buildPath: string,
  _electronVersion: string,
  platform: string,
  _arch: string,
  callback: () => void,
): void => {
  const cwd = path.resolve(buildPath, '..');
  const projectRoot = path.resolve(__dirname, '..');

  console.log('Copy npm packages with node-worker dependencies with binary (dugite) or __filename usages (tiddlywiki), which cannot be prepared properly by webpack');

  if (['production', 'test'].includes(process.env.NODE_ENV ?? '')) {
    console.log('Copying tiddlywiki dependency to dist');
    const sourceNodeModulesFolder = path.resolve(projectRoot, 'node_modules');

    fs.cpSync(
      path.join(sourceNodeModulesFolder, 'zx'),
      path.join(cwd, 'node_modules', 'zx'),
      { dereference: true, recursive: true },
    );

    const packagePathsToCopyDereferenced: string[][] = [
      ['tiddlywiki', 'package.json'],
      ['tiddlywiki', 'boot'],
      ['tiddlywiki', 'core'],
      // only copy plugins that is used in src/services/wiki/wikiWorker/startNodeJSWiki.ts, other plugins can be installed via JSON from online plugin library
      ['tiddlywiki', 'plugins', 'linonetwo'],
      ['tiddlywiki', 'plugins', 'tiddlywiki', 'filesystem'],
      ['tiddlywiki', 'plugins', 'tiddlywiki', 'tiddlyweb'],
      ['tiddlywiki', 'tiddlywiki.js'],
      // node binary
      ['better-sqlite3', 'build', 'Release', 'better_sqlite3.node'],
      // nsfw native module
      ['nsfw', 'build', 'Release', 'nsfw.node'],
      // Refer to `node_modules\sqlite-vec\index.cjs` for latest file names
      // sqlite-vec: copy main entry files and platform-specific binary
      ['sqlite-vec', 'package.json'],
      ['sqlite-vec', 'index.cjs'],
      [`sqlite-vec-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`],
    ];

    // macOS only: copy app-path binary for finding apps
    if (platform === 'darwin') {
      packagePathsToCopyDereferenced.push(['app-path', 'main']);
    }

    console.log('Copying packagePathsToCopyDereferenced');
    for (const packagePathInNodeModules of packagePathsToCopyDereferenced) {
      // some binary may not exist in other platforms, so allow failing here.
      try {
        fs.copySync(
          path.resolve(sourceNodeModulesFolder, ...packagePathInNodeModules),
          path.resolve(cwd, 'node_modules', ...packagePathInNodeModules),
          { dereference: true },
        );
      } catch (error) {
        // some binary may not exist in other platforms, so allow failing here.
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `Error copying ${packagePathInNodeModules.join('/')} to dist, in afterPack.ts: ${errorMessage}`,
        );
      }
    }

    console.log('Copy dugite');
    // it has things like `git/bin/libexec/git-core/git-add` link to `git/bin/libexec/git-core/git`, to reduce size, so can't use `dereference: true, recursive: true` here.
    fs.copySync(
      path.join(sourceNodeModulesFolder, 'dugite'),
      path.join(cwd, 'node_modules', 'dugite'),
      { dereference: false },
    );

    if (platform === 'win32') {
      console.log('Copy registry-js (Windows only)');
      // registry-js has native binary that is loaded using relative path (../../build/Release/registry.node)
      fs.copySync(
        path.join(sourceNodeModulesFolder, 'registry-js'),
        path.join(cwd, 'node_modules', 'registry-js'),
        { dereference: true },
      );
    }
  }

  /** complete this hook */
  callback();
};
