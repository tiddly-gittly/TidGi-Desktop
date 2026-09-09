import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { getTiddlyWikiRequireAnchor, loadTiddlyWikiModule } from '../loadTiddlyWikiModule';

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
    expect(String(requireAnchors[0])).toBe(getTiddlyWikiRequireAnchor());
    expect(path.isAbsolute(String(requireAnchors[0]))).toBe(true);
    expect(String(requireAnchors[0])).not.toContain(bootPath);
  });

  it('preserves a valid require anchor in the CommonJS utility-process bundle', async () => {
    const bundleDirectory = mkdtempSync(path.join(tmpdir(), 'tidgi-wiki-worker-bundle-'));
    temporaryDirectories.push(bundleDirectory);
    await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        emptyOutDir: false,
        lib: {
          entry: path.resolve(__dirname, '../loadTiddlyWikiModule.ts'),
          fileName: () => 'loadTiddlyWikiModule.cjs',
          formats: ['cjs'],
        },
        outDir: bundleDirectory,
        rollupOptions: {
          external: ['node:fs', 'node:module', 'node:path', 'path'],
        },
      },
    });

    const bundledLoader = createRequire(import.meta.url)(path.join(bundleDirectory, 'loadTiddlyWikiModule.cjs')) as typeof import('../loadTiddlyWikiModule');
    const { bootPath } = createTiddlyWikiPackage();
    const requireAnchors: Array<string | URL> = [];
    const { TiddlyWiki } = await bundledLoader.loadTiddlyWikiModule(bootPath, undefined, {
      createRequire: (anchor) => {
        requireAnchors.push(anchor);
        return createRequire(anchor);
      },
    });

    expect(TiddlyWiki()).toEqual({ fixture: true });
    expect(requireAnchors).toEqual([getTiddlyWikiRequireAnchor()]);
    expect(path.isAbsolute(String(requireAnchors[0]))).toBe(true);
    expect(String(requireAnchors[0])).not.toContain(bootPath);
  });

  it('rejects a non-absolute executable path for the require anchor', () => {
    expect(() => getTiddlyWikiRequireAnchor('electron')).toThrow(/executable path must be absolute/i);
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
