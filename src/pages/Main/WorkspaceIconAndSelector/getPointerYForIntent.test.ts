import { describe, expect, it } from 'vitest';

import { getPointerYForIntent } from './getPointerYForIntent';

describe('getPointerYForIntent', () => {
  const rect = { top: 400, height: 90 };

  it('uses a captured pointer that is over the current target', () => {
    expect(getPointerYForIntent({
      activatorPointerY: 470,
      capturedPointerY: 430,
      rect,
    })).toBe(430);
  });

  it('rejects a stale captured pointer outside the current target', () => {
    expect(getPointerYForIntent({
      activatorPointerY: 445,
      capturedPointerY: 160,
      rect,
    })).toBe(445);
  });

  it('falls back to the target center when no pointer position is available', () => {
    expect(getPointerYForIntent({ rect })).toBe(445);
  });
});
