import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { copyPackageDependencyClosure, resolvePackageDirectory } from '../afterPack';

describe('resolvePackageDirectory', () => {
  it('resolves a dependency using its parent package pnpm context', () => {
    const typeormFolder = resolvePackageDirectory('typeorm', path.resolve('node_modules'));
    const yargsFolder = resolvePackageDirectory('yargs', typeormFolder);
    const yargsPackage = fs.readJsonSync(path.join(yargsFolder, 'package.json')) as { version: string };

    expect(yargsPackage.version).toBe('18.0.0');
  });

  it('does not mistake an export-mapped dist package.json for the package root', () => {
    const sdkFolder = resolvePackageDirectory(
      '@modelcontextprotocol/sdk',
      path.resolve('node_modules'),
    );
    const sdkPackage = fs.readJsonSync(path.join(sdkFolder, 'package.json')) as {
      name: string;
      version: string;
    };

    expect(sdkPackage).toMatchObject({
      name: '@modelcontextprotocol/sdk',
      version: '1.29.0',
    });
    expect(sdkFolder.endsWith(path.join('@modelcontextprotocol', 'sdk'))).toBe(true);
  });

  it('copies the external electron-unhandled runtime dependency closure', () => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-after-pack-'));
    try {
      const failures = new Set<string>();
      copyPackageDependencyClosure(
        'electron-unhandled',
        path.resolve('node_modules'),
        destination,
        'electron-unhandled',
        failures,
      );

      expect([...failures]).toEqual([]);
      expect(fs.readJsonSync(path.join(destination, 'electron-unhandled', 'package.json')))
        .toMatchObject({ name: 'electron-unhandled', version: '5.0.0' });
      expect(fs.existsSync(path.join(destination, 'clean-stack', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(destination, 'serialize-error', 'package.json'))).toBe(true);
    } finally {
      fs.removeSync(destination);
    }
  });
});
