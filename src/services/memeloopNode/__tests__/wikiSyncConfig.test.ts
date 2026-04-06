import { describe, expect, it } from 'vitest';
import { allSections } from '@services/preferences/definitions/registry';
import { syncableConfigFields, syncableConfigDefaultValues } from '@services/workspaces/syncableConfig';

describe('allSections registration', () => {
  it('does not contain removed wikiSync section', () => {
    const ids = allSections.map((s) => s.id);
    expect(ids).not.toContain('wikiSync');
  });

  it('does not contain removed imChannels section', () => {
    const ids = allSections.map((s) => s.id);
    expect(ids).not.toContain('imChannels');
  });

  it('contains externalAPI section after sync section', () => {
    const ids = allSections.map((s) => s.id);
    const syncIndex = ids.indexOf('sync');
    const externalAPIIndex = ids.indexOf('externalAPI');
    expect(syncIndex).toBeGreaterThanOrEqual(0);
    expect(externalAPIIndex).toBeGreaterThan(syncIndex);
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
