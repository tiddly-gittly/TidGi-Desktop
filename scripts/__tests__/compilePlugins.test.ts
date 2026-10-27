import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const watchPluginOutput = path.resolve(
  projectRoot,
  'node_modules/tiddlywiki/plugins/linonetwo/watch-filesystem-adaptor/WatchFileSystemAdaptor.js',
);
const reusablePluginRoot = path.resolve(projectRoot, 'node_modules/tiddlywiki/plugins/linonetwo');

describe('compiled filesystem watcher native module loading', () => {
  it('passes the explicit nsfw binary env through the wiki worker factory', () => {
    const wikiSource = readFileSync(path.resolve(projectRoot, 'src/services/wiki/index.ts'), 'utf8');

    expect(wikiSource).toContain('TIDGI_NSFW_BINARY_PATH: NSFW_BINARY_PATH');
    expect(wikiSource).toContain('env: createWikiWorkerEnvironment(proxyPreferences)');
  });

  it('builds a watcher artifact that requires the env-provided absolute binary', () => {
    execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'build:plugin'], {
      cwd: projectRoot,
      stdio: 'ignore',
      // Windows command shims require cmd.exe; all arguments here are constants.
      shell: process.platform === 'win32',
    });

    expect(existsSync(watchPluginOutput)).toBe(true);
    const compiledSource = readFileSync(watchPluginOutput, 'utf8');
    expect(compiledSource).toContain('TIDGI_NSFW_BINARY_PATH');
    expect(compiledSource).toContain('must be an absolute path to nsfw.node');
    expect(compiledSource).not.toMatch(/require\(\s*["']nsfw\/build\/Release\/nsfw\.node["']\s*\)/);
    expect(existsSync(path.join(reusablePluginRoot, 'tidgi-language-model'))).toBe(false);
    expect(existsSync(path.join(reusablePluginRoot, 'memeloop-agent-ui'))).toBe(false);
    expect(existsSync(path.join(reusablePluginRoot, 'tw-react'))).toBe(false);
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
  }, 30_000);

  it('keeps the compiled binary location aligned with afterPack output', () => {
    const afterPackSource = readFileSync(path.resolve(projectRoot, 'scripts/afterPack.ts'), 'utf8');

    expect(afterPackSource).toContain("['nsfw', 'build', 'Release', 'nsfw.node']");
  });
});
