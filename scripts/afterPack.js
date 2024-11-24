/* eslint-disable security-node/detect-crlf */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable unicorn/import-style */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable unicorn/prevent-abbreviations */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/**
 * Remove all .lproj files
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
const path = require('path');
const fs = require('fs-extra');
const packageJSON = require('../package.json');

/**
 * Specific which lproj you want to keep
 */
const keepingLprojRegEx = /(en|zh_CN)\.lproj/g;
/**
 * Running postMake hook
 * @param {*} buildPath /var/folders/qj/7j0zx32d0l75zmnrl1w3m3b80000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64/Electron.app/Contents/Resources/app
 * @param {*} electronVersion 12.0.6
 * @param {*} platform darwin / win32 (even on win11 x64)
 * @param {*} arch x64
 * @returns
 */
exports.default = async (
  buildPath,
  electronVersion,
  platform,
  arch,
  callback,
) => {
  const cwd = path.resolve(buildPath, '..');
  const projectRoot = path.resolve(__dirname, '..');
  // const appParentPath = path.resolve(buildPath, '..', '..', '..', '..');
  // const appPath = path.join(appParentPath, 'Electron.app');
  // const shell = platform === 'darwin' ? '/bin/zsh' : undefined;
  // const winMacLinuxPlatformName = platform === 'darwin' ? 'mac' : (platform === 'win32' ? 'win' : 'linux');
  /** delete useless lproj files to make it clean */
  // const lproj = glob.sync('*.lproj', { cwd });
  const lproj = fs.readdirSync(cwd).filter((dir) => dir.endsWith('.lproj'));
  const pathsToRemove = lproj
    .filter((dir) => !keepingLprojRegEx.test(dir))
    .map((dir) => path.join(cwd, dir));
  if (platform === 'darwin') {
    await Promise.all(pathsToRemove.map(async (dir) => {
      await fs.remove(dir);
    }));
  }
  console.log(`copy npm packages with node-worker dependencies with binary (dugite) or __filename usages (tiddlywiki), which can't be prepare properly by webpack`);
  if (['production', 'test'].includes(process.env.NODE_ENV)) {
    console.log('Copying tiddlywiki dependency to dist');
    const sourceNodeModulesFolder = path.resolve(projectRoot, 'node_modules');
    fs.cpSync(
      path.join(sourceNodeModulesFolder, 'zx'),
      path.join(cwd, 'node_modules', 'zx'),
      { dereference: true, recursive: true },
    );
    // not using pnpm, because after using it, it always causing problem here, causing `Error: spawn /bin/sh ENOENT` in github actions
    // it can probably being "working directory didn't exist" in  https://github.com/nodejs/node/issues/9644#issuecomment-282060923
    // exec(`pnpm i --shamefully-hoist --prod --ignore-scripts`, { cwd: path.join(cwd, 'node_modules', 'zx'), shell });
    // exec(`npm i --legacy-building --omit=dev`, {
    //   cwd: path.join(cwd, 'node_modules', 'zx'),
    //   shell,
    // });
    // exec(`npm i --legacy-building --omit=dev`, {
    //   cwd: path.join(cwd, 'node_modules', 'zx', 'node_modules', 'globby'),
    //   shell,
    // });
    // exec(`npm i --legacy-building --omit=dev --ignore-scripts`, {
    //   cwd: path.join(
    //     cwd,
    //     'node_modules',
    //     'zx',
    //     'node_modules',
    //     'node-fetch',
    //   ),
    //   shell,
    // });
    const packagePathsToCopyDereferenced = [
      ['tiddlywiki', 'package.json'],
      ['tiddlywiki', 'boot'],
      ['tiddlywiki', 'core'],
      // only copy plugins that is used in src/services/wiki/wikiWorker/startNodeJSWiki.ts , other plugins can be installed via JSON from online plugin library
      ['tiddlywiki', 'plugins', 'linonetwo'],
      ['tiddlywiki', 'plugins', 'tiddlywiki', 'filesystem'],
      ['tiddlywiki', 'plugins', 'tiddlywiki', 'tiddlyweb'],
      ['tiddlywiki', 'tiddlywiki.js'],
      // we only need its `main` binary, no need its dependency and code, because we already copy it to src/services/native/externalApp
      ['app-path', 'main'],
    ];
    console.log(`Copying packagePathsToCopyDereferenced`);
    for (const packagePathInNodeModules of packagePathsToCopyDereferenced) {
      // some binary may not exist in other platforms, so allow failing here.
      try {
        fs.copySync(
          path.resolve(sourceNodeModulesFolder, ...packagePathInNodeModules),
          path.resolve(cwd, 'node_modules', ...packagePathInNodeModules),
          { dereference: true, recursive: true },
        );
      } catch (error) {
        // some binary may not exist in other platforms, so allow failing here.
        console.error(
          `Error copying ${
            packagePathInNodeModules.join(
              '/',
            )
          } to dist, in afterPack.js, Error: ${error.message}`,
        );
      }
    }
    console.log('Copy dugite');
    // it has things like `git/bin/libexec/git-core/git-add` link to `git/bin/libexec/git-core/git`, to reduce size, so can't use `dereference: true, recursive: true` here.
    // And pnpm will have node_modules/dugite to be a shortcut, can't just copy it with `dereference: false`, have to copy from .pnpm folder
    fs.copySync(
      path.join(
        sourceNodeModulesFolder,
        '.pnpm',
        `dugite@${packageJSON.dependencies.dugite}`,
        'node_modules',
        'dugite',
      ),
      path.join(cwd, 'node_modules', 'dugite'),
      {
        dereference: false,
        recursive: true,
      },
    );
  }
  /** sign it for mac m1 https://www.zhihu.com/question/431722091/answer/1592339574 (only work if user run this.)
   * And have error
   * ```
   * An unhandled rejection has occurred inside Forge:
    Error: Command failed: xattr -rd com.apple.quarantine /var/folders/t3/0jyr287x3rd2m0b6ml8w4f2c0000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64-8UwtyU/Electron.app
    xattr: No such file: /var/folders/t3/0jyr287x3rd2m0b6ml8w4f2c0000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64-8UwtyU/Electron.app/Contents/Resources/node_modules/dugite
    ```
   */
  // if (platform === 'darwin') {
  //   exec(`xattr -rd com.apple.quarantine ${appPath}`, { cwd: appParentPath, shell });
  // }
  /** complete this hook */
  callback();
};
