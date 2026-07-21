import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  patchSetupExeLogButton,
  prepareSquirrelVendor,
  SETUP_LOG_FORMAT_UTF16,
} from '../prepareSquirrelVendor';

const stockSetupExe = path.join(__dirname, '..', '..', 'node_modules', 'electron-winstaller', 'vendor', 'Setup.exe');

describe('prepareSquirrelVendor', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('patches Setup.exe so the open-log format no longer targets SquirrelSetup.log', () => {
    if (!fs.existsSync(stockSetupExe)) {
      return;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-squirrel-setup-'));
    tempDirs.push(dir);
    const setupPath = path.join(dir, 'Setup.exe');
    fs.copySync(stockSetupExe, setupPath);

    expect(fs.readFileSync(setupPath).includes(SETUP_LOG_FORMAT_UTF16)).toBe(true);

    expect(patchSetupExeLogButton(setupPath)).toBe(true);

    const patched = fs.readFileSync(setupPath);
    expect(patched.includes(SETUP_LOG_FORMAT_UTF16)).toBe(false);
    expect(patched.includes(Buffer.from('SquirrelSetup.log', 'utf16le'))).toBe(false);
    // Truncated format is `%s` then wide NUL — opens the SquirrelTemp directory.
    expect(patched.includes(Buffer.from('%s\0', 'utf16le'))).toBe(true);
    // Second call is a no-op once the old format string is gone.
    expect(patchSetupExeLogButton(setupPath)).toBe(false);
  });

  it('copies electron-winstaller vendor and patches Setup.exe into the target directory', () => {
    const sourceVendor = path.join(__dirname, '..', '..', 'node_modules', 'electron-winstaller', 'vendor');
    if (!fs.existsSync(sourceVendor)) {
      return;
    }

    const targetVendor = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-squirrel-vendor-'));
    tempDirs.push(targetVendor);
    // prepareSquirrelVendor rmSync+copySync into target; use a nested path we own
    fs.rmSync(targetVendor, { recursive: true, force: true });

    const result = prepareSquirrelVendor(sourceVendor, targetVendor);
    expect(result.patched).toBe(true);
    expect(fs.existsSync(path.join(targetVendor, 'Setup.exe'))).toBe(true);
    expect(fs.existsSync(path.join(targetVendor, 'Squirrel.exe'))).toBe(true);
    expect(fs.readFileSync(path.join(targetVendor, 'Setup.exe')).includes(SETUP_LOG_FORMAT_UTF16)).toBe(false);
  });
});
