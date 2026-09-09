import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const watchPluginOutput = path.resolve(
  projectRoot,
  'node_modules/tiddlywiki/plugins/linonetwo/watch-filesystem-adaptor/WatchFileSystemAdaptor.js',
);
const memeLoopPluginOutput = path.resolve(
  projectRoot,
  'node_modules/tiddlywiki/plugins/linonetwo/memeloop-agent-ui',
);

describe('compiled filesystem watcher native module loading', () => {
  it('passes the explicit nsfw binary env through the wiki worker factory', () => {
    const wikiSource = readFileSync(path.resolve(projectRoot, 'src/services/wiki/index.ts'), 'utf8');

    expect(wikiSource).toContain('TIDGI_NSFW_BINARY_PATH: NSFW_BINARY_PATH');
    expect(wikiSource).toContain('env: createWikiWorkerEnvironment(proxyPreferences)');
  });

  it('builds a watcher artifact that requires the env-provided absolute binary', () => {
    execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'build:plugin'], { cwd: projectRoot, stdio: 'ignore' });

    expect(existsSync(watchPluginOutput)).toBe(true);
    const compiledSource = readFileSync(watchPluginOutput, 'utf8');
    expect(compiledSource).toContain('TIDGI_NSFW_BINARY_PATH');
    expect(compiledSource).toContain('must be an absolute path to nsfw.node');
    expect(compiledSource).not.toMatch(/require\(\s*["']nsfw\/build\/Release\/nsfw\.node["']\s*\)/);
  }, 30_000);

  it('keeps the compiled binary location aligned with afterPack output', () => {
    const afterPackSource = readFileSync(path.resolve(projectRoot, 'scripts/afterPack.ts'), 'utf8');

    expect(afterPackSource).toContain("['nsfw', 'build', 'Release', 'nsfw.node']");
  });

  it('builds the MemeLoop widget as browser-guarded JavaScript without source files', () => {
    const widgetSource = readFileSync(path.join(memeLoopPluginOutput, 'widget.js'), 'utf8');
    const componentSource = readFileSync(path.join(memeLoopPluginOutput, 'components.js'), 'utf8');

    expect(widgetSource.indexOf('if ($tw.browser)')).toBeLessThan(widgetSource.indexOf('require("$:/plugins/linonetwo/memeloop-agent-ui/components.js")'));
    expect(componentSource).toContain('pluginExports.MemeLoopAgentChatWidget');
    expect(componentSource).toContain('node_modules/react-dom/client.js');
    expect(componentSource).not.toMatch(/require\(["']\$:\/plugins\/linonetwo\/tw-react\/widget\.js["']\)/);
    expect(componentSource).not.toMatch(/require\(["']react(?:-dom)?(?:\/[^"']+)?["']\)/);
    expect(existsSync(path.join(memeLoopPluginOutput, 'components.tsx'))).toBe(false);
    expect(existsSync(path.resolve(projectRoot, 'node_modules/tiddlywiki/plugins/linonetwo/tw-react'))).toBe(false);
  });
});
