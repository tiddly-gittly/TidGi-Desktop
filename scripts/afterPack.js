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
const glob = require('glob');
const fs = require('fs-extra');
const util = require('util');
const packageJSON = require('../package.json');
const exec = util.promisify(require('child_process').exec);

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
  const appParentPath = path.resolve(buildPath, '..', '..', '..', '..');
  const appPath = path.join(appParentPath, 'Electron.app');
  const shell = platform === 'darwin' ? '/bin/zsh' : undefined;

  /** delete useless lproj files to make it clean */
  const lproj = glob.sync('*.lproj', { cwd });
  const pathsToRemove = lproj
    .filter((dir) => !keepingLprojRegEx.test(dir))
    .map((dir) => path.join(cwd, dir));
  if (platform === 'darwin') {
    await Promise.all(pathsToRemove.map((dir) => fs.remove(dir)));
  }
  /** copy npm packages with node-worker dependencies with binary (dugite, llama-node) or __filename usages (tiddlywiki), which can't be prepare properly by webpack */
  const tasks = [];
  if (['production', 'test'].includes(process.env.NODE_ENV)) {
    console.log('Copying tiddlywiki dependency to dist');
    const sourceNodeModulesFolder = path.resolve(projectRoot, 'node_modules');
    tasks.push(
      fs
        .copy(
          path.join(sourceNodeModulesFolder, 'zx'),
          path.join(cwd, 'node_modules', 'zx'),
          { dereference: true },
        )
        .then(async () => {
          // not using pnpm, because after using it, it always causing problem here, causing `Error: spawn /bin/sh ENOENT` in github actions
          // it can probably being "working directory didn't exist" in  https://github.com/nodejs/node/issues/9644#issuecomment-282060923
          // await exec(`pnpm i --shamefully-hoist --prod --ignore-scripts`, { cwd: path.join(cwd, 'node_modules', 'zx'), shell });
          await exec(`npm i --legacy-building --production`, {
            cwd: path.join(cwd, 'node_modules', 'zx'),
            shell,
          });
          await exec(`npm i --legacy-building --production`, {
            cwd: path.join(cwd, 'node_modules', 'zx', 'node_modules', 'globby'),
            shell,
          });
          await exec(`npm i --legacy-building --production --ignore-scripts`, {
            cwd: path.join(
              cwd,
              'node_modules',
              'zx',
              'node_modules',
              'node-fetch',
            ),
            shell,
          });
        }),
    );
    const packagePathsToCopyDereferenced = [
      [`sqlite-vss-${process.platform}-${process.arch}`],
      ['@tiddlygit', 'tiddlywiki', 'package.json'],
      ['@tiddlygit', 'tiddlywiki', 'boot'],
      ['@tiddlygit', 'tiddlywiki', 'core'],
      ['@tiddlygit', 'tiddlywiki', 'plugins'],
      ['@tiddlygit', 'tiddlywiki', 'themes'],
      ['@tiddlygit', 'tiddlywiki', 'languages'],
      ['@tiddlygit', 'tiddlywiki', 'tiddlywiki.js'],
      // llama-node and @llama-node/core etc. include too many source code, so only copy its binary
      ['llama-node', 'dist'],
      ['llama-node', 'package.json'],
      ['llama-node', '20B_tokenizer.json'],
      ['@llama-node', 'core', 'index.js'],
      ['@llama-node', 'core', 'package.json'],
      ['@llama-node', 'rwkv-cpp', 'index.js'],
      ['@llama-node', 'rwkv-cpp', 'package.json'],
      ['@llama-node', 'llama-cpp', 'index.js'],
      ['@llama-node', 'llama-cpp', 'package.json'],
      ['better-sqlite3', 'build', 'Release', 'better_sqlite3.node'],
      // we only need its `main` binary, no need its dependency and code, because we already copy it to src/services/native/externalApp
      ['app-path', 'main'],
    ];
    // it by default pack files for all platforms, we only copy what current platform needs
    const llamaCore = ['@llama-node', 'core', '@llama-node'];
    const llamaRwkv = ['@llama-node', 'rwkv-cpp', '@llama-node'];
    const llamaCpp = ['@llama-node', 'llama-cpp', '@llama-node'];
    await Promise.all(
      [llamaCore, llamaRwkv, llamaCpp].map(async (llamaPath) => {
        const llamaBinaryFiles = await fs.readdir(
          path.resolve(sourceNodeModulesFolder, ...llamaPath),
        );
        /**
         * 'core.darwin-arm64.node',
         * 'core.darwin-x64.node',
         * 'core.linux-x64-gnu.node',
         * 'core.linux-x64-musl.node',
         * 'core.win32-x64-msvc.node'
         */
        const filesInPlatform = llamaBinaryFiles.filter(
          (file) => file.includes(platform) && file.includes(arch),
        );
        filesInPlatform.forEach((fileName) => {
          packagePathsToCopyDereferenced.push([...llamaPath, fileName]);
        });
      }),
    );

    for (const packagePathInNodeModules of packagePathsToCopyDereferenced) {
      // some binary may not exist in other platforms, so allow failing here.
      tasks.push(
        fs
          .copy(
            path.resolve(sourceNodeModulesFolder, ...packagePathInNodeModules),
            path.resolve(cwd, 'node_modules', ...packagePathInNodeModules),
            { dereference: true },
          )
          .catch((error) => {
            // some binary may not exist in other platforms, so allow failing here.
            console.error(
              `Error copying ${
                packagePathInNodeModules.join(
                  '/',
                )
              } to dist, in afterPack.js, Error: ${error.message}`,
            );
          }),
      );
    }
    // it has things like `git/bin/libexec/git-core/git-add` link to `git/bin/libexec/git-core/git`, to reduce size, so can't use `dereference: true` here.
    // And pnpm will have node_modules/dugite to be a shortcut, can't just copy it with `dereference: false`, have to copy from .pnpm folder
    tasks.push(
      fs.copy(
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
        },
      ),
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
  //   await exec(`xattr -rd com.apple.quarantine ${appPath}`, { cwd: appParentPath, shell });
  // }
  await Promise.all(tasks);
  /** complete this hook */
  callback();
};
