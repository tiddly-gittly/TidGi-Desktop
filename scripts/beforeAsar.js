/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/promise-function-async */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable unicorn/import-style */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable security/detect-child-process */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable unicorn/prevent-abbreviations */
/**
 * Remove all .lproj files
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
const path = require('path');
const fs = require('fs-extra');

/**
 * @param {*} buildPath /var/folders/qj/7j0zx32d0l75zmnrl1w3m3b80000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64/Electron.app/Contents/Resources/app
 * @param {*} electronVersion 12.0.6
 * @param {*} platform darwin
 * @param {*} arch x64
 * @returns
 */
exports.default = async (buildPath, electronVersion, platform, arch, callback) => {
  const cwd = path.resolve(buildPath, '..');
  const pathsToRemove = ['.webpack/main/localization/', '.webpack/main/native_modules/dist/', '.webpack/out/'].map((directory) => path.join(cwd, directory));
  await Promise.all(pathsToRemove.map((directory) => fs.remove(directory).catch((error) => console.error(error))));

  /** complete this hook */
  callback();
};
