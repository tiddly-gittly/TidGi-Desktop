import { describe, expect, it } from 'vitest';

import { requiresVirtualXDisplay } from '../xDisplay';

describe('requiresVirtualXDisplay', () => {
  it.each(
    [
      ['linux', false, true],
      ['linux', true, false],
      ['win32', false, false],
      ['darwin', false, false],
    ] as const,
  )(
    '%s with display=%s -> requires xvfb=%s',
    (platform, hasDisplay, expected) => {
      expect(requiresVirtualXDisplay(platform, hasDisplay)).toBe(expected);
    },
  );
});
