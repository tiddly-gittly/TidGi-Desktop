import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getNodeWikiExtraPlugins } from '../nodeWikiExtraPlugins';

describe('getNodeWikiExtraPlugins', () => {
  it('loads both official plugins required by the HTTP server', () => {
    expect(getNodeWikiExtraPlugins(true, false)).toEqual(expect.arrayContaining(['plugins/tiddlywiki/filesystem', 'plugins/tiddlywiki/tiddlyweb']));
  });

  it('keeps filesystem available for a read-only HTTP workspace', () => {
    const plugins = getNodeWikiExtraPlugins(true, true);

    expect(plugins).toContain('plugins/tiddlywiki/filesystem');
    expect(plugins).not.toContain('plugins/linonetwo/watch-filesystem-adaptor');
  });

  it('does not load HTTP-only plugins for the version-only worker path', () => {
    const plugins = getNodeWikiExtraPlugins(false, false);

    expect(plugins).not.toContain('plugins/tiddlywiki/filesystem');
    expect(plugins).not.toContain('plugins/tiddlywiki/tiddlyweb');
  });

  it('loads MemeLoop UI from the reusable template plugins instead of a Desktop-only injection', () => {
    const plugins = getNodeWikiExtraPlugins(false, false);
    expect(plugins).not.toContain('plugins/linonetwo/memeloop-agent-ui');
    expect(plugins).not.toContain('plugins/linonetwo/tw-react');

    const templateRoot = path.resolve(process.cwd(), 'template/wiki/tiddlers/system');
    const memeLoopPath = path.join(templateRoot, '$__plugins_linonetwo_memeloop-agent-ui.json');
    const twReactPath = path.join(templateRoot, '$__plugins_linonetwo_tw-react.json');
    expect(existsSync(memeLoopPath)).toBe(true);
    expect(existsSync(twReactPath)).toBe(true);
    const memeLoopPlugin = JSON.parse(readFileSync(memeLoopPath, 'utf8')) as {
      title?: string;
      version?: string;
      dependents?: string;
    };
    expect(memeLoopPlugin).toMatchObject({
      title: '$:/plugins/linonetwo/memeloop-agent-ui',
      version: '0.4.0',
      dependents: '$:/plugins/linonetwo/tw-react',
    });
  });
});
