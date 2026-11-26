// @vitest-environment node
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { compilePlugins } from '../compilePlugins.mjs';

const projectRoot = process.cwd();
let pluginRoot: string;

describe('compiled filesystem watcher native module loading', () => {
  beforeAll(async () => {
    pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'tidgi-compiled-plugins-'));
    await compilePlugins((pluginName: string) => [path.join(pluginRoot, pluginName)]);
  });

  afterAll(async () => {
    await rm(pluginRoot, { recursive: true, force: true });
  });

  function loadWatcher(binaryPath: string | undefined, loadNative: (filename: string) => unknown): void {
    const pluginModule = { exports: {} };
    const require = createRequire(path.join(projectRoot, 'package.json'));
    runInNewContext(readFileSync(path.join(pluginRoot, 'watch-filesystem-adaptor/WatchFileSystemAdaptor.js'), 'utf8'), {
      module: pluginModule,
      exports: pluginModule.exports,
      require: (specifier: string): unknown => specifier.endsWith('.node') ? loadNative(specifier) : require(specifier) as unknown,
      process: {
        env: { TIDGI_NSFW_BINARY_PATH: binaryPath },
        platform: process.platform,
        parentPort: { on: vi.fn(), postMessage: vi.fn() },
      },
      console,
      setTimeout,
      clearTimeout,
      Buffer,
      $tw: { node: true, browser: false, boot: {} },
    });
  }

  it('loads the main-process native binary even outside the wiki dependency tree', () => {
    const binaryPath = path.join(projectRoot, 'native-fixture', 'nsfw.node');
    const selectedNative = new Error('selected native binary');
    const loadNative = vi.fn(() => {
      throw selectedNative;
    });
    expect(() => {
      loadWatcher(binaryPath, loadNative);
    }).toThrow(selectedNative);
    expect(loadNative).toHaveBeenCalledExactlyOnceWith(binaryPath);
  });

  it('exports the renderer adaptor as a TiddlyWiki CommonJS module', () => {
    // TiddlyWiki consumes module.exports, not the original exports alias.
    // Mixing an ESM test export with exports.adaptorClass silently hides the
    // renderer adaptor after esbuild replaces module.exports.
    const ipcSource = readFileSync(path.join(pluginRoot, 'tidgi-ipc-syncadaptor/ipc-syncadaptor.js'), 'utf8');
    const pluginModule = { exports: {} as Record<string, unknown> };
    runInNewContext(ipcSource, {
      module: pluginModule,
      exports: pluginModule.exports,
      $tw: { browser: true },
      window: { service: { wiki: {} }, meta: () => ({ workspace: { id: 'fixture' } }) },
      document: { location: { protocol: 'tidgi:' } },
    });
    expect(typeof pluginModule.exports.adaptorClass).toBe('function');
  });
});
