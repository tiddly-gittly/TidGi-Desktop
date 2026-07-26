/**
 * Handle Squirrel events on Windows during installation/update/uninstallation.
 *
 * Based on: https://github.com/mongodb-js/electron-squirrel-startup/blob/master/index.js
 * Inline implementation to avoid ESM/CommonJS compatibility issues with the original package.
 * See: https://github.com/mongodb-js/electron-squirrel-startup/issues/49#issuecomment-2211722234
 *
 * Uninstall icon: stock Squirrel downloads nuspec `iconUrl` synchronously at the end of Setup.
 * That hangs when the URL (often GitHub raw) is unreachable. We omit `iconUrl` from the nuspec and
 * instead copy a packaged local `icon.ico` to `%LocalAppData%\tidgi\app.ico`, then set DisplayIcon
 * ourselves during `--squirrel-install` / `--squirrel-updated` (runs before CreateUninstallerRegistryEntry).
 */
import { app } from 'electron';
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(arguments_: string[], done: () => void): void {
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  console.log(`Spawning Update.exe with args: ${arguments_.join(' ')}`);

  spawn(updateExe, arguments_, {
    detached: true,
  }).on('close', done);
}

export type RegRunner = (
  command: string,
  arguments_: string[],
  options: { windowsHide: boolean; encoding: BufferEncoding },
) => SpawnSyncReturns<string>;

/**
 * Copy packaged icon.ico to the Squirrel install root as app.ico and set Programs and Features DisplayIcon.
 * Safe to call when the uninstall registry key does not exist yet — CreateUninstallerRegistryEntry later
 * fills other values and does not clear DisplayIcon when nuspec has no iconUrl.
 */
export function installLocalUninstallIcon(
  execPath = process.execPath,
  resourcesPath = process.resourcesPath,
  runReg: RegRunner = spawnSync,
): string | undefined {
  const installRoot = path.resolve(path.dirname(execPath), '..');
  const targetIco = path.join(installRoot, 'app.ico');
  const candidates = [
    path.join(resourcesPath, 'icon.ico'),
    path.join(path.dirname(execPath), 'icon.ico'),
  ];
  const sourceIco = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourceIco) {
    console.warn('No packaged icon.ico found; skipping uninstall DisplayIcon');
    return undefined;
  }

  try {
    fs.copyFileSync(sourceIco, targetIco);
  } catch (error) {
    console.warn('Failed to copy app.ico for uninstall icon', error);
    return undefined;
  }

  const appName = path.basename(installRoot);
  const registryKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}`;
  const result = runReg('reg', ['add', registryKey, '/v', 'DisplayIcon', '/t', 'REG_SZ', '/d', targetIco, '/f'], {
    windowsHide: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.warn('Failed to set uninstall DisplayIcon', result.stderr || result.error);
  }

  return targetIco;
}

function check(): boolean {
  if (process.platform === 'win32') {
    const command = process.argv[1];
    console.log(`Processing squirrel command: ${command ?? 'none'}`);
    const target = path.basename(process.execPath);

    if (command === '--squirrel-install' || command === '--squirrel-updated') {
      installLocalUninstallIcon();
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
