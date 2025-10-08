/**
 * Remove unnecessary directories before creating asar archive
 * Based on https://ganeshrvel.medium.com/electron-builder-afterpack-configuration-5c2c986be665
 * Adapted for electron forge https://github.com/electron-userland/electron-forge/issues/2248
 */
import fs from 'fs-extra';
import path from 'path';

/**
 * Running beforeAsar hook
 * Note: This must be a non-async function that accepts a callback for Electron Packager compatibility
 * @param buildPath /var/folders/qj/7j0zx32d0l75zmnrl1w3m3b80000gn/T/electron-packager/darwin-x64/TidGi-darwin-x64/Electron.app/Contents/Resources/app
 * @param electronVersion 12.0.6
 * @param platform darwin
 * @param arch x64
 * @param callback Callback to signal completion
 */
export default (
  buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: () => void,
): void => {
  const cwd = path.resolve(buildPath, '..');
  const pathsToRemove = ['.webpack/main/localization/', '.webpack/main/native_modules/dist/', '.webpack/out/'].map((directory) => path.join(cwd, directory));

  // Execute async operations and call callback when done
  Promise.all(
    pathsToRemove.map(async (directory) => {
      try {
        await fs.remove(directory);
      } catch (error: unknown) {
        console.error(error);
      }
    }),
  )
    .then(() => {
      /** complete this hook */
      callback();
    })
    .catch((error: unknown) => {
      console.error('Error in beforeAsar hook:', error);
      callback();
    });
};
