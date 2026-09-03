import { SupportedStorageServices } from '@services/types';
import { describe, expect, it } from 'vitest';

import { wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { extractSyncableConfig, mergeWithSyncedConfig, removeSyncableFields } from '../configSetting';

const baseWorkspace = {
  ...wikiWorkspaceDefaultValues,
  id: 'ws-1',
  name: 'demo',
  wikiFolderLocation: '/tmp/demo',
  gitUrl: null,
  storageService: SupportedStorageServices.local,
  isSubWiki: false,
  mainWikiID: null,
} as const;

describe('tidgiConfig syncable fields for git repo scope', () => {
  it('extractSyncableConfig includes gitRepoPath and gitManagedRelativePath when set', () => {
    const workspace = { ...baseWorkspace, gitRepoPath: '..', gitManagedRelativePath: 'wiki' };
    const extracted = extractSyncableConfig(workspace);
    expect(extracted.gitRepoPath).toBe('..');
    expect(extracted.gitManagedRelativePath).toBe('wiki');
  });

  it('extractSyncableConfig omits gitRepoPath when it is the default (null)', () => {
    const extracted = extractSyncableConfig(baseWorkspace);
    expect(extracted.gitRepoPath).toBeUndefined();
    expect(extracted.gitManagedRelativePath).toBeUndefined();
  });

  it('removeSyncableFields strips gitRepoPath and gitManagedRelativePath', () => {
    const workspace = { ...baseWorkspace, gitRepoPath: '..', gitManagedRelativePath: 'wiki' };
    const localOnly = removeSyncableFields(workspace) as Record<string, unknown>;
    expect(localOnly.gitRepoPath).toBeUndefined();
    expect(localOnly.gitManagedRelativePath).toBeUndefined();
    // local-only fields are preserved
    expect(localOnly.wikiFolderLocation).toBe('/tmp/demo');
  });

  it('mergeWithSyncedConfig applies synced gitRepoPath over local config', () => {
    const local = { ...baseWorkspace, gitRepoPath: null, gitManagedRelativePath: null };
    const synced = { gitRepoPath: '../..', gitManagedRelativePath: 'sub/wiki' };
    const merged = mergeWithSyncedConfig(local, synced);
    expect(merged.gitRepoPath).toBe('../..');
    expect(merged.gitManagedRelativePath).toBe('sub/wiki');
  });
});
