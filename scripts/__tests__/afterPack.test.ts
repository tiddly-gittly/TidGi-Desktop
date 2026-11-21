// @vitest-environment node
import fs from 'fs-extra';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { copyPackageDependencyClosure } from '../afterPack';

describe('packaged runtime dependencies', () => {
  it('preserves conflicting dependency versions and cycles when loading the packaged tree', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-after-pack-versions-'));
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-after-pack-output-'));
    const writePackage = (folder: string, name: string, dependencies: Record<string, string>, body: string): void => {
      fs.outputJsonSync(path.join(folder, 'package.json'), { name, version: '1.0.0', main: 'index.js', dependencies });
      fs.writeFileSync(path.join(folder, 'index.js'), body);
    };
    try {
      const modules = path.join(fixture, 'node_modules');
      writePackage(path.join(modules, 'root-package'), 'root-package', { left: '*', right: '*' }, 'module.exports = [require("left"), require("right")];');
      writePackage(path.join(modules, 'left'), 'left', { shared: '*', 'root-package': '*' }, 'module.exports = require("shared");');
      writePackage(path.join(modules, 'right'), 'right', { shared: '*' }, 'module.exports = require("shared");');
      writePackage(path.join(modules, 'shared'), 'shared', {}, 'module.exports = "v1";');
      writePackage(path.join(modules, 'right', 'node_modules', 'shared'), 'shared', {}, 'module.exports = "v2";');
      copyPackageDependencyClosure('root-package', fixture, path.join(destination, 'node_modules'));
      const require = createRequire(path.join(destination, 'node_modules', 'root-package', 'package.json'));
      expect(require('./index.js')).toEqual(['v1', 'v2']);
    } finally {
      fs.removeSync(fixture);
      fs.removeSync(destination);
    }
  });

  it('copies the external electron-unhandled runtime dependency closure', () => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-after-pack-'));
    try {
      copyPackageDependencyClosure(
        'electron-unhandled',
        path.resolve('node_modules'),
        destination,
      );

      expect(fs.readJsonSync(path.join(destination, 'electron-unhandled', 'package.json')))
        .toMatchObject({ name: 'electron-unhandled' });
      expect(fs.existsSync(path.join(destination, 'clean-stack', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(destination, 'serialize-error', 'package.json'))).toBe(true);
    } finally {
      fs.removeSync(destination);
    }
  });

  it('loads the installed MCP and TypeORM entry points from the copied runtime tree', () => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-after-pack-runtime-'));
    try {
      const modules = path.join(destination, 'node_modules');
      const copiedPackages = new Map<string, string>();
      for (const packageName of ['typeorm', '@modelcontextprotocol/sdk']) {
        copyPackageDependencyClosure(packageName, path.resolve('node_modules'), modules, copiedPackages);
      }
      const require = createRequire(path.join(destination, 'probe.cjs'));
      expect(require('typeorm')).toHaveProperty('DataSource', expect.any(Function));
      expect(require('@modelcontextprotocol/sdk/server/mcp.js')).toHaveProperty('McpServer', expect.any(Function));
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

      copyPackageDependencyClosure(
        'root-package',
        fixture,
        destination,
      );

      expect(fs.existsSync(path.join(destination, 'required-package', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(destination, 'installed-optional', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(destination, 'unavailable-platform-optional'))).toBe(false);
      writePackage('installed-optional', { dependencies: { 'missing-required': '1.0.0' } });
      expect(() => {
        copyPackageDependencyClosure('root-package', fixture, destination);
      }).toThrow('missing-required');
    } finally {
      fs.removeSync(fixture);
      fs.removeSync(destination);
    }
  });
});
