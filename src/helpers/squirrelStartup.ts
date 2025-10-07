/**
 * Handle Squirrel events on Windows during installation/update/uninstallation.
 *
 * Based on: https://github.com/mongodb-js/electron-squirrel-startup/blob/master/index.js
 * Inline implementation to avoid ESM/CommonJS compatibility issues with the original package.
 * See: https://github.com/mongodb-js/electron-squirrel-startup/issues/49#issuecomment-2211722234
 */
import { app } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';

function run(arguments_: string[], done: () => void): void {
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  console.log(`Spawning Update.exe with args: ${arguments_.join(' ')}`);

  spawn(updateExe, arguments_, {
    detached: true,
  }).on('close', done);
}

function check(): boolean {
  if (process.platform === 'win32') {
    const command = process.argv[1];
    console.log(`Processing squirrel command: ${command ?? 'none'}`);
    const target = path.basename(process.execPath);

    if (command === '--squirrel-install' || command === '--squirrel-updated') {
      run([`--createShortcut=${target}`], () => {
        app.quit();
      });
      return true;
    }
    if (command === '--squirrel-uninstall') {
      run([`--removeShortcut=${target}`], () => {
        app.quit();
      });
      return true;
    }
    if (command === '--squirrel-obsolete') {
      app.quit();
      return true;
    }
  }
  return false;
}

export default check();
