import { describe, expect, it } from 'vitest';

import { HTML_WIKI_SAVER_BOOTSTRAP_SCRIPT_ID, injectHtmlWikiSaverBootstrap } from '../injectHtmlWikiSaverBootstrap';

describe('injectHtmlWikiSaverBootstrap', () => {
  it('injects saver bootstrap script into head', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    const result = injectHtmlWikiSaverBootstrap(html);
    expect(result).toContain(`id="${HTML_WIKI_SAVER_BOOTSTRAP_SCRIPT_ID}"`);
    expect(result).toContain('tiddlyfox-message-box');
    expect(result).toContain('tidgiHtmlWikiSave');
  });

  it('does not double-inject when bootstrap already present', () => {
    const html = injectHtmlWikiSaverBootstrap('<html><head></head><body></body></html>');
    const once = (html.match(new RegExp(HTML_WIKI_SAVER_BOOTSTRAP_SCRIPT_ID, 'g')) ?? []).length;
    const twice = (injectHtmlWikiSaverBootstrap(html).match(new RegExp(HTML_WIKI_SAVER_BOOTSTRAP_SCRIPT_ID, 'g')) ?? []).length;
    expect(once).toBe(1);
    expect(twice).toBe(1);
  });
});
