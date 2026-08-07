import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTiddlyWikiModule } from '../loadTiddlyWikiModule';

const temporaryDirectories: string[] = [];

function createTiddlyWikiPackage(
  manifestOverrides: Record<string, unknown> = {},
  entrySource = 'module.exports = { TiddlyWiki: () => ({ fixture: true }) };',
): { bootPath: string; packagePath: string } {
  const resourcesPath = mkdtempSync(path.join(tmpdir(), 'tidgi-resources-'));
  temporaryDirectories.push(resourcesPath);
  const packagePath = path.join(resourcesPath, 'node_modules', 'tiddlywiki');
  const bootPath = path.join(packagePath, 'boot');
  mkdirSync(bootPath, { recursive: true });
  writeFileSync(
    path.join(packagePath, 'package.json'),
    JSON.stringify({ name: 'tiddlywiki', version: '5.4.1', main: './boot/boot.js', ...manifestOverrides }),
  );
  writeFileSync(path.join(bootPath, 'boot.js'), entrySource);
  return { bootPath, packagePath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('loadTiddlyWikiModule', () => {
  it('loads the manifest CJS entry from a packaged Resources/node_modules layout', async () => {
    const { bootPath } = createTiddlyWikiPackage();

    const { TiddlyWiki } = await loadTiddlyWikiModule(bootPath);

    expect(TiddlyWiki()).toEqual({ fixture: true });
  });

  it('loads an absolute validated entry without calling the package resolver', async () => {
    const { bootPath } = createTiddlyWikiPackage();
    const actualRequire = createRequire(import.meta.url);
    const resolve = () => {
      throw new Error('fixture package resolver must not be called');
    };
    const packageRequire = Object.assign(
      (identifier: string): unknown => {
        const loadedModule = actualRequire(identifier) as unknown;
        return loadedModule;
      },
      actualRequire,
      { resolve },
    ) as NodeJS.Require;
    const requireAnchors: Array<string | URL> = [];

    const { TiddlyWiki } = await loadTiddlyWikiModule(bootPath, undefined, {
      createRequire: (anchor) => {
        requireAnchors.push(anchor);
        return packageRequire;
      },
    });

    expect(TiddlyWiki()).toEqual({ fixture: true });
    expect(requireAnchors).toHaveLength(1);
    expect(String(requireAnchors[0])).toMatch(/loadTiddlyWikiModule\.ts$/);
    expect(String(requireAnchors[0])).not.toContain(bootPath);
  });

  it('rejects a package whose manifest identity is not TiddlyWiki', async () => {
    const { bootPath } = createTiddlyWikiPackage({ name: 'not-tiddlywiki' });

    await expect(loadTiddlyWikiModule(bootPath)).rejects.toThrow(/expected package name "tiddlywiki"/i);
  });

  it('rejects a package whose manifest version is invalid', async () => {
    const { bootPath } = createTiddlyWikiPackage({ version: 'not-semver' });

    await expect(loadTiddlyWikiModule(bootPath)).rejects.toThrow(/expected a semantic version/i);
  });

  it('rejects an entry that escapes the installed package directory', async () => {
    const { bootPath, packagePath } = createTiddlyWikiPackage({ main: '../../outside.js' });
    writeFileSync(path.resolve(packagePath, '../../outside.js'), 'module.exports = { TiddlyWiki: () => ({}) };');

    await expect(loadTiddlyWikiModule(bootPath)).rejects.toThrow(/outside the package directory/i);
  });
});
