/**
 * Remove all .lproj files
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
const path = require('path');
const glob = require('glob');
const fs = require('fs-extra');
const util = require('util');
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
  if (['production', 'test'].includes(process.env.NODE_ENV)) {
    console.log('Copying tiddlywiki dependency to dist');
    await fs.copy(path.join(projectRoot, 'node_modules', '@tiddlygit', 'tiddlywiki'), path.join(cwd, 'node_modules', '@tiddlygit', 'tiddlywiki'), { dereference: true });
    // it has things like `git/bin/libexec/git-core/git-add` link to `git/bin/libexec/git-core/git`, to reduce size, so can't use `dereference: true` here.
    await fs.copy(path.join(projectRoot, 'node_modules', '.pnpm', 'dugite@2.5.0', 'node_modules', 'dugite'), path.join(cwd, 'node_modules', 'dugite'), { dereference: false });
    // we only need its `main` binary
    await fs.mkdirp(path.join(cwd, 'node_modules', 'app-path'));
    await fs.copy(path.join(projectRoot, 'node_modules', 'app-path', 'main'), path.join(cwd, 'node_modules', 'app-path', 'main'), { dereference: true });
    await fs.copy(path.resolve(projectRoot, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'), path.resolve(cwd, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'), { dereference: true });
    const sqliteVssPackages = ['sqlite-vss-linux-x64', 'sqlite-vss-darwin-x64', 'sqlite-vss-darwin-arm64']
    for (const sqliteVssPackage of sqliteVssPackages) {
      try {
        await fs.copy(path.resolve(projectRoot, `node_modules/${sqliteVssPackage}`), path.resolve(cwd, `node_modules/${sqliteVssPackage}`), { dereference: true });
      } catch {}
    }
    // await exec(`npm i --legacy-building`, { cwd: path.join(cwd, 'node_modules', 'app-path') });
    // await exec(`npm i --legacy-building`, { cwd: path.join(cwd, 'node_modules', 'app-path', 'node_modules', 'cross-spawn') });
    // await exec(`npm i --legacy-building`, { cwd: path.join(cwd, 'node_modules', 'app-path', 'node_modules', 'get-stream') });
    await fs.copy(path.join(projectRoot, 'node_modules', 'zx'), path.join(cwd, 'node_modules', 'zx'), { dereference: true });
    // not using pnpm, because after using it, it always causing problem here, causing `Error: spawn /bin/sh ENOENT` in github actions
    // it can probably being "working directory didn't exist" in  https://github.com/nodejs/node/issues/9644#issuecomment-282060923
    await exec(`npm i --legacy-building`, { cwd: path.join(cwd, 'node_modules', 'zx'), shell });
    await exec(`npm i --legacy-building`, { cwd: path.join(cwd, 'node_modules', 'zx', 'node_modules', 'globby'), shell });
    await exec(`npm i --legacy-building --ignore-scripts`, { cwd: path.join(cwd, 'node_modules', 'zx', 'node_modules', 'node-fetch'), shell });
  }
  /** sign it for mac m1 https://www.zhihu.com/question/431722091/answer/1592339574 */
  if (platform === 'darwin') {
    await exec(`xattr -rd com.apple.quarantine ${appPath}`, { cwd: appParentPath, shell });
  }
  /** complete this hook */
  callback();
};
