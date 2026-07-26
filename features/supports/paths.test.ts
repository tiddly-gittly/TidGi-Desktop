import { describe, expect, it } from 'vitest';
import { makeRunScopedScenarioSlug } from './paths';

describe('makeRunScopedScenarioSlug', () => {
  it('isolates identical scenarios from concurrent runs', () => {
    const first = makeRunScopedScenarioSlug('Filesystem lifecycle', 'run-alpha');
    const second = makeRunScopedScenarioSlug('Filesystem lifecycle', 'run-beta');

    expect(first).toBe('run-alpha-Filesystem lifecycle');
    expect(second).toBe('run-beta-Filesystem lifecycle');
    expect(first).not.toBe(second);
  });

  it('keeps the run identifier when long scenario names are truncated', () => {
    const slug = makeRunScopedScenarioSlug('x'.repeat(200), 'run-12345678');

    expect(slug).toHaveLength(60);
    expect(slug.startsWith('run-12345678-')).toBe(true);
  });
});
