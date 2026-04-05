import { describe, expect, it } from 'vitest';
import { allSections } from '@services/preferences/definitions/registry';
import { syncableConfigFields, syncableConfigDefaultValues } from '@services/workspaces/syncableConfig';

describe('wikiSync preferences section', () => {
  it('is registered in allSections', () => {
    const ids = allSections.map((s) => s.id);
    expect(ids).toContain('wikiSync');
  });

  it('appears after sync section', () => {
    const ids = allSections.map((s) => s.id);
    const syncIndex = ids.indexOf('sync');
    const wikiSyncIndex = ids.indexOf('wikiSync');
    expect(syncIndex).toBeGreaterThanOrEqual(0);
    expect(wikiSyncIndex).toBe(syncIndex + 1);
  });
});

describe('workspace sync config fields', () => {
  it('includes syncTargetNodeIds in syncable fields', () => {
    expect(syncableConfigFields).toContain('syncTargetNodeIds');
  });

  it('includes syncToCloudGitea in syncable fields', () => {
    expect(syncableConfigFields).toContain('syncToCloudGitea');
  });

  it('has default values for sync target fields', () => {
    expect(syncableConfigDefaultValues.syncTargetNodeIds).toEqual([]);
    expect(syncableConfigDefaultValues.syncToCloudGitea).toBe(false);
  });
});
