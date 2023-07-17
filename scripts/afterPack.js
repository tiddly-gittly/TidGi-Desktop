/**
 * Remove all .lproj files
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
const path = require('path');
const glob = require('glob');
const fs = require('fs-extra');
const util = require('util');
const packageJSON = require('../package.json')
const exec = util.promisify(require('child_process').exec);

/**
 * Specific which lproj you want to keep
 */
const keepingLprojRegEx = /(en|zh_CN)\.lproj/g;
/**
 *
 * @param {*} buildPath /var/folders/qj/7j0zx32d0l75zmnrl1w3m3b80000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64/Electron.app/Contents/Resources/app
 * @param {*} electronVersion 12.0.6
 * @param {*} platform darwin
 * @param {*} arch x64
 * @returns
 */
exports.default = async (buildPath, electronVersion, platform, arch, callback) => {
  const cwd = path.resolve(buildPath, '..');
  const projectRoot = path.resolve(__dirname, '..');
  const appParentPath = path.resolve(buildPath, '..', '..', '..', '..');
  const appPath = path.join(appParentPath, 'Electron.app');
  const shell = platform === 'darwin' ? '/bin/zsh' : undefined;

  /** delete useless lproj files to make it clean */
  const lproj = glob.sync('*.lproj', { cwd });
  const pathsToRemove = lproj.filter((dir) => !keepingLprojRegEx.test(dir)).map((dir) => path.join(cwd, dir));
  if (platform === 'darwin') {
    await Promise.all(pathsToRemove.map((dir) => fs.remove(dir)));
  }
  /** copy npm packages with node-worker dependencies with binary or __filename usages, which can't be prepare properly by webpack */
  const tasks = [];
  if (['production', 'test'].includes(process.env.NODE_ENV)) {
    console.log('Copying tiddlywiki dependency to dist');
    tasks.push(fs.copy(path.join(projectRoot, 'node_modules', 'zx'), path.join(cwd, 'node_modules', 'zx'), { dereference: true }).then(async () => {
      // not using pnpm, because after using it, it always causing problem here, causing `Error: spawn /bin/sh ENOENT` in github actions
      // it can probably being "working directory didn't exist" in  https://github.com/nodejs/node/issues/9644#issuecomment-282060923
      // await exec(`pnpm i --shamefully-hoist --prod --ignore-scripts`, { cwd: path.join(cwd, 'node_modules', 'zx'), shell });
      await exec(`npm i --legacy-building`, { cwd: path.join(cwd, 'node_modules', 'zx'), shell });
      await exec(`npm i --legacy-building`, { cwd: path.join(cwd, 'node_modules', 'zx', 'node_modules', 'globby'), shell });
      await exec(`npm i --legacy-building --ignore-scripts`, { cwd: path.join(cwd, 'node_modules', 'zx', 'node_modules', 'node-fetch'), shell });
    }));
    const packagePathsToCopyDereferenced = [
      ['@tiddlygit', 'tiddlywiki'],
      ['llama-node'],
      ['@llama-node','llama-cpp'],
      ['@llama-node','core'],
      ['@llama-node','rwkv-cpp'],
      ['better-sqlite3','build','Release','better_sqlite3.node'],
    ]
    for (const packagePathInNodeModules of packagePathsToCopyDereferenced) {
      // some binary may not exist in other platforms, so allow failing here.
      tasks.push(fs.copy(path.resolve(projectRoot, 'node_modules', ...packagePathInNodeModules), path.resolve(cwd, 'node_modules', ...packagePathInNodeModules), { dereference: true }));
    }
    const sqliteVssPackages = ['sqlite-vss-linux-x64', 'sqlite-vss-darwin-x64', 'sqlite-vss-darwin-arm64']
    for (const sqliteVssPackage of sqliteVssPackages) {
      // some binary may not exist in other platforms, so allow failing here.
      tasks.push(fs.copy(path.resolve(projectRoot, 'node_modules', sqliteVssPackage), path.resolve(cwd, 'node_modules', sqliteVssPackage), { dereference: true }).catch(() => {}));
    }
    // it has things like `git/bin/libexec/git-core/git-add` link to `git/bin/libexec/git-core/git`, to reduce size, so can't use `dereference: true` here.
    // And pnpm will have node_modules/dugite to be a shortcut, can't just copy it with `dereference: false`, have to copy from .pnpm folder
    tasks.push(fs.copy(path.join(projectRoot, 'node_modules', '.pnpm', `dugite@${packageJSON.dependencies.dugite}`, 'node_modules', 'dugite'), path.join(cwd, 'node_modules', 'dugite'), { dereference: false }));
    // we only need its `main` binary, no need its dependency and code, because we already copy it to src/services/native/externalApp
    tasks.push(fs.mkdirp(path.join(cwd, 'node_modules', 'app-path')).then(async () => {
      await fs.copy(path.join(projectRoot, 'node_modules', 'app-path', 'main'), path.join(cwd, 'node_modules', 'app-path', 'main'), { dereference: true })
    }));
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
