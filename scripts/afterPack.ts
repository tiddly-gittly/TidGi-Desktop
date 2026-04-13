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
  arch: string,
  callback: () => void,
): void => {
  const cwd = path.resolve(buildPath, '..');
  const appNodeModulesDirectory = path.resolve(buildPath, 'node_modules');
  const projectRoot = path.resolve(__dirname, '..');
  const linkedWorkspaceNodeModulesDirectory = path.resolve(
    projectRoot,
    '../memeloop/node_modules/.pnpm/node_modules',
  );
  const packageSourceRoots = [
    path.resolve(projectRoot, 'node_modules'),
    linkedWorkspaceNodeModulesDirectory,
  ];

  const resolvePackageSource = (...packagePathInNodeModules: string[]) => {
    for (const sourceRoot of packageSourceRoots) {
      const candidate = path.resolve(sourceRoot, ...packagePathInNodeModules);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return path.resolve(
      packageSourceRoots[0] ?? projectRoot,
      ...packagePathInNodeModules,
    );
  };

  const getSqliteVecPlatformPackageName = () => {
    const os = platform === 'win32' ? 'windows' : platform;
    return `sqlite-vec-${os}-${arch}`;
  };

  console.log(
    'Copy npm packages with node-worker dependencies with binary (dugite) or __filename usages (tiddlywiki), which cannot be prepared properly by webpack',
  );

  if (['production', 'test'].includes(process.env.NODE_ENV ?? '')) {
    console.log('Copying tiddlywiki dependency to dist');
    const sourceNodeModulesFolder = packageSourceRoots[0] ?? path.resolve(projectRoot, 'node_modules');

    fs.cpSync(
      path.join(sourceNodeModulesFolder, 'zx'),
      path.join(cwd, 'node_modules', 'zx'),
      { dereference: true, recursive: true },
    );

    const packagePathsToCopyDereferenced: string[][] = [
      ['tiddlywiki', 'package.json'],
      ['tiddlywiki', 'boot'],
      ['tiddlywiki', 'core'],
      // core-server: introduced in TiddlyWiki 5.4.0, contains Commander module ($tw.Commander) required by load-modules startup
      ['tiddlywiki', 'core-server'],
      // only copy plugins that is used in src/services/wiki/wikiWorker/startNodeJSWiki.ts, other plugins can be installed via JSON from online plugin library
      ['tiddlywiki', 'plugins', 'linonetwo'],
      ['tiddlywiki', 'plugins', 'tiddlywiki', 'filesystem'],
      ['tiddlywiki', 'plugins', 'tiddlywiki', 'tiddlyweb'],
      ['tiddlywiki', 'tiddlywiki.js'],
      // node binary
      ['better-sqlite3', 'build', 'Release', 'better_sqlite3.node'],
      // `ws` optional native deps (required in our bundled Electron runtime when it tries to resolve them)
      ['bufferutil'],
      ['utf-8-validate'],
      // `memeloop` node server uses lazy `require('faye-websocket')`
      ['faye-websocket'],
      // `faye-websocket` runtime dependency
      ['websocket-driver'],
      // `websocket-driver` runtime dependencies
      ['http-parser-js'],
      ['safe-buffer'],
      ['websocket-extensions'],
      // Noise handshake resolves native crypto addons relative to package files at runtime.
      ['sodium-universal'],
      ['sodium-native'],
      ['require-addon'],
      ['which-runtime'],
      ['bare-addon-resolve'],
      ['bare-module-resolve'],
      ['bare-semver'],
      // nsfw native module
      ['nsfw', 'build', 'Release', 'nsfw.node'],
      // Refer to `node_modules\sqlite-vec\index.cjs` for latest file names
      // sqlite-vec: copy main entry files and platform-specific binary
      ['sqlite-vec', 'package.json'],
      ['sqlite-vec', 'index.cjs'],
      [getSqliteVecPlatformPackageName()],
    ];

    // macOS only: copy app-path binary for finding apps
    if (platform === 'darwin') {
      packagePathsToCopyDereferenced.push(['app-path', 'main']);
    }

    console.log('Copying packagePathsToCopyDereferenced');
    for (const packagePathInNodeModules of packagePathsToCopyDereferenced) {
      // some binary may not exist in other platforms, so allow failing here.
      try {
        const first = packagePathInNodeModules[0] ?? '';
        const source = resolvePackageSource(...packagePathInNodeModules);

        const destinationMain = path.resolve(
          cwd,
          'node_modules',
          ...packagePathInNodeModules,
        );
        fs.copySync(source, destinationMain, { dereference: true });

        // `ws`'s optional native deps may be required from inside `app.asar` bundles,
        // so place them both in Resources/node_modules and Resources/app/node_modules.
        if (
          first === 'bufferutil' ||
          first === 'utf-8-validate' ||
          first === 'sodium-universal' ||
          first === 'sodium-native' ||
          first === 'require-addon' ||
          first === 'which-runtime' ||
          first === 'bare-addon-resolve' ||
          first === 'bare-module-resolve' ||
          first === 'bare-semver'
        ) {
          const destinationApp = path.resolve(
            appNodeModulesDirectory,
            ...packagePathInNodeModules,
          );
          fs.copySync(source, destinationApp, { dereference: true });
        }
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
