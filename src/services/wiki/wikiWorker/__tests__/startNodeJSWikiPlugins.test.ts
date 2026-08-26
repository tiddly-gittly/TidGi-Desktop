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

  it('loads the self-contained reusable MemeLoop widget', () => {
    const plugins = getNodeWikiExtraPlugins(false, false);

    expect(plugins).toContain('plugins/linonetwo/memeloop-agent-ui');
    expect(plugins).not.toContain('plugins/linonetwo/tw-react');
  });
});
