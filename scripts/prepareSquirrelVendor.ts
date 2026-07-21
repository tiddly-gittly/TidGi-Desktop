/**
 * Prepare a Squirrel vendor directory for electron-winstaller.
 *
 * electron-winstaller ships Setup.exe 1.9.1 (opens `%LocalAppData%\SquirrelTemp\SquirrelSetup.log`)
 * alongside Squirrel.exe 2.0.1 (writes `Squirrel-Install.log`). The failure dialog's
 * "Open setup log" button therefore opens a path that does not exist and appears to do nothing.
 *
 * Official NuGet squirrel.windows@2.0.1 has the same mismatched Setup.exe, so we copy the
 * stock vendor and patch Setup.exe so the button opens the SquirrelTemp folder (where the
 * real logs live) instead of a missing file.
 *
 * @see https://github.com/Squirrel/Squirrel.Windows/issues/1912
 */
import fs from 'fs-extra';
import path from 'path';

export const SQUIRREL_VENDOR_DIR = path.join(__dirname, '..', 'build-resources', 'squirrel-vendor');

/** UTF-16LE path format used by Setup.exe when opening the setup log. */
export const SETUP_LOG_FORMAT_UTF16 = Buffer.from('%s\\SquirrelSetup.log', 'utf16le');

/**
 * Patch Setup.exe so "Open setup log" opens the SquirrelTemp directory (`%s`) rather than
 * a non-existent `SquirrelSetup.log` file under it.
 *
 * Setup.exe is native C++ with null-terminated wide strings, so we truncate the format
 * string in-place and zero the remainder of the old literal.
 *
 * @returns true if a patch was applied
 */
export function patchSetupExeLogButton(setupExePath: string): boolean {
  const bytes = fs.readFileSync(setupExePath);
  const index = bytes.indexOf(SETUP_LOG_FORMAT_UTF16);
  if (index === -1) {
    if (!bytes.includes(Buffer.from('SquirrelSetup.log', 'utf16le'))) {
      return false;
    }
    throw new Error(`Could not find Setup log format string in ${setupExePath}`);
  }

  // Keep `%s` then null-terminate; wipe the rest of `SquirrelSetup.log`.
  const percentS = Buffer.from('%s', 'utf16le');
  percentS.copy(bytes, index);
  const wipeFrom = index + percentS.length;
  const wipeTo = index + SETUP_LOG_FORMAT_UTF16.length + 2;
  bytes.fill(0, wipeFrom, Math.min(wipeTo, bytes.length));

  fs.writeFileSync(setupExePath, bytes);
  return true;
}

export function prepareSquirrelVendor(
  sourceVendorDirectory = path.join(__dirname, '..', 'node_modules', 'electron-winstaller', 'vendor'),
  targetVendorDirectory = SQUIRREL_VENDOR_DIR,
): { patched: boolean; targetVendorDirectory: string } {
  if (!fs.existsSync(sourceVendorDirectory)) {
    throw new Error(`electron-winstaller vendor not found at ${sourceVendorDirectory}`);
  }

  fs.mkdirSync(path.dirname(targetVendorDirectory), { recursive: true });
  fs.rmSync(targetVendorDirectory, { recursive: true, force: true });
  fs.copySync(sourceVendorDirectory, targetVendorDirectory);

  const setupExePath = path.join(targetVendorDirectory, 'Setup.exe');
  if (!fs.existsSync(setupExePath)) {
    throw new Error(`Setup.exe missing after vendor copy: ${setupExePath}`);
  }

  const patched = patchSetupExeLogButton(setupExePath);
  return { patched, targetVendorDirectory };
}

if (require.main === module) {
  const result = prepareSquirrelVendor();
  console.log(
    result.patched
      ? `Prepared Squirrel vendor with Setup.exe log-button patch at ${result.targetVendorDirectory}`
      : `Prepared Squirrel vendor (Setup.exe already patched or unchanged) at ${result.targetVendorDirectory}`,
  );
}
