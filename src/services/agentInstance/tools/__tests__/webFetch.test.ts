import { describe, expect, it } from 'vitest';

import { htmlToText } from '../webFetch';

describe('htmlToText', () => {
  it('removes active content while preserving readable page text', () => {
    const result = htmlToText('<style>body { display: none }</style><p>Hello</p><script>alert("xss")</script><p>World</p>');

    expect(result).toContain('Hello');
    expect(result).toContain('World');
    expect(result).not.toContain('display: none');
    expect(result).not.toContain('alert');
  });

  it('does not turn encoded markup into active HTML', () => {
    const result = htmlToText('&lt;script&gt;encoded&lt;/script&gt;');

    expect(result).toBe('&lt;script&gt;encoded&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });
});
