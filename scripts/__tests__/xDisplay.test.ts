import { describe, expect, it } from 'vitest';

import { requiresVirtualXDisplay } from '../xDisplay';

describe('requiresVirtualXDisplay', () => {
  it('requires xvfb only for headless Linux', () => {
    expect(requiresVirtualXDisplay('linux', false)).toBe(true);
    expect(requiresVirtualXDisplay('linux', true)).toBe(false);
    expect(requiresVirtualXDisplay('win32', false)).toBe(false);
    expect(requiresVirtualXDisplay('darwin', false)).toBe(false);
  });
});
