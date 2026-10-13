import { SupportedStorageServices } from '@services/types';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { extractSyncableConfig, mergeWithSyncedConfig, removeSyncableFields } from '../configSetting';
import { readTidgiConfig, readTidgiConfigSync, writeTidgiConfig } from '../tidgiConfig';

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

describe('portable identity round trip', () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  it('retains the shared ID across disk reads, local import, and subsequent saves', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-portable-identity-'));
    directories.push(directory);
    const source = { ...baseWorkspace, id: 'Shared-Wiki', wikiFolderLocation: directory };
    await writeTidgiConfig(directory, extractSyncableConfig(source));
    expect(readTidgiConfigSync(directory)).toMatchObject({ id: 'Shared-Wiki' });
    const config = await readTidgiConfig(directory);
    const imported = mergeWithSyncedConfig({ ...source, id: 'mac-local' }, config);
    expect(imported.id).toBe('Shared-Wiki');
    await writeTidgiConfig(directory, extractSyncableConfig({ ...imported, name: 'Changed on Mac' }));
    expect(JSON.parse(await readFile(path.join(directory, 'tidgi.config.json'), 'utf8'))).toMatchObject({
      id: 'Shared-Wiki',
      name: 'Changed on Mac',
    });
    const before = await readFile(path.join(directory, 'tidgi.config.json'), 'utf8');
    await expect(writeTidgiConfig(directory, { id: 'mac-local', name: 'A racing settings save' }))
      .rejects.toThrow('Portable workspace identity mismatch');
    expect(await readFile(path.join(directory, 'tidgi.config.json'), 'utf8')).toBe(before);
  });
});

describe('tidgiConfig syncable fields for git repo scope', () => {
  it('preserves a non-default symlink watcher policy across portable config sync', () => {
    const workspace = { ...baseWorkspace, ignoreSymlinks: false };

    expect(extractSyncableConfig(workspace).ignoreSymlinks).toBe(false);
    expect(removeSyncableFields(workspace)).not.toHaveProperty('ignoreSymlinks');
    expect(mergeWithSyncedConfig(baseWorkspace, { ignoreSymlinks: false }).ignoreSymlinks).toBe(false);
  });

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
