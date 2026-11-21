// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const projectRoot = process.cwd();
const watchPluginOutput = path.resolve(
  projectRoot,
  'node_modules/tiddlywiki/plugins/linonetwo/watch-filesystem-adaptor/WatchFileSystemAdaptor.js',
);
const reusablePluginRoot = path.resolve(projectRoot, 'node_modules/tiddlywiki/plugins/linonetwo');

describe('compiled filesystem watcher native module loading', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [path.join(projectRoot, 'scripts/compilePlugins.mjs')], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
  });

  function loadWatcher(binaryPath: string | undefined, loadNative: (filename: string) => unknown): void {
    const pluginModule = { exports: {} };
    const require = createRequire(path.join(projectRoot, 'package.json'));
    runInNewContext(readFileSync(watchPluginOutput, 'utf8'), {
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

  it.each([undefined, 'relative/nsfw.node'])('rejects an invalid native location (%s) before loading a binary', binaryPath => {
    const loadNative = vi.fn();
    expect(() => {
      loadWatcher(binaryPath, loadNative);
    }).toThrow('must be an absolute path');
    expect(loadNative).not.toHaveBeenCalled();
  });

  it('exports the renderer adaptor as a TiddlyWiki CommonJS module', () => {
    // TiddlyWiki consumes module.exports, not the original exports alias.
    // Mixing an ESM test export with exports.adaptorClass silently hides the
    // renderer adaptor after esbuild replaces module.exports.
    const ipcSource = readFileSync(path.join(reusablePluginRoot, 'tidgi-ipc-syncadaptor/ipc-syncadaptor.js'), 'utf8');
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
