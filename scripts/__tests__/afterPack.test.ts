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

  it('rejects path-like dependency names before resolving a destination', () => {
    expect(() => resolvePackageDirectory('../outside', path.resolve('node_modules')))
      .toThrow('Invalid package name');
    expect(() => resolvePackageDirectory('@scope/../../outside', path.resolve('node_modules')))
      .toThrow('Invalid package name');
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

  it('copies installed optional dependencies and skips unavailable platform optionals', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-after-pack-source-'));
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-after-pack-destination-'));
    const writePackage = (
      name: string,
      manifest: Record<string, unknown> = {},
    ): void => {
      fs.outputJsonSync(path.join(fixture, 'node_modules', ...name.split('/'), 'package.json'), {
        name,
        version: '1.0.0',
        ...manifest,
      });
    };

    try {
      fs.writeJsonSync(path.join(fixture, 'package.json'), { name: 'fixture' });
      writePackage('root-package', {
        dependencies: { 'required-package': '1.0.0' },
        optionalDependencies: {
          'installed-optional': '1.0.0',
          'unavailable-platform-optional': '1.0.0',
        },
      });
      writePackage('required-package');
      writePackage('installed-optional');

      const failures = new Set<string>();
      copyPackageDependencyClosure(
        'root-package',
        fixture,
        destination,
        'root-package',
        failures,
      );

      expect([...failures]).toEqual([]);
      expect(fs.existsSync(path.join(destination, 'required-package', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(destination, 'installed-optional', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(destination, 'unavailable-platform-optional'))).toBe(false);
    } finally {
      fs.removeSync(fixture);
      fs.removeSync(destination);
    }
  });
});
