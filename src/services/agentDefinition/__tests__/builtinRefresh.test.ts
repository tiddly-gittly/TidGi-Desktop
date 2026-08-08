import { describe, expect, it } from 'vitest';

import { shouldRefreshBuiltinDefinition } from '../index';

function legacyEntity(created: string, updated: string) {
  return {
    builtinVersion: undefined,
    isCustomized: undefined,
    createdAt: new Date(created),
    updatedAt: new Date(updated),
  };
}

describe('bundled Agent definition refresh', () => {
  it('refreshes an explicitly uncustomized bundled definition', () => {
    expect(shouldRefreshBuiltinDefinition({
      ...legacyEntity('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
      builtinVersion: '1.0.0',
      isCustomized: false,
    })).toBe(true);
  });

  it('preserves an explicitly customized bundled definition', () => {
    expect(shouldRefreshBuiltinDefinition({
      ...legacyEntity('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      builtinVersion: '1.0.0',
      isCustomized: true,
    })).toBe(false);
  });

  it('refreshes unchanged legacy rows and preserves edited legacy rows', () => {
    expect(shouldRefreshBuiltinDefinition(
      legacyEntity('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    )).toBe(true);
    expect(shouldRefreshBuiltinDefinition(
      legacyEntity('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
    )).toBe(false);
  });
});
