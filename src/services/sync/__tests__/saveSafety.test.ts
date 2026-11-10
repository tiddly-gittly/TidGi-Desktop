import { SupportedStorageServices } from '@services/types';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { WorkspaceType } from '@services/workspaces/workspaceType';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sync } from '..';

function fixture() {
  const workspace = {
    id: 'fixture',
    workspaceType: 'folder',
    wikiFolderLocation: '/fixture',
    storageService: SupportedStorageServices.local,
  } as IWikiWorkspace;
  const wiki = {
    waitForPendingSaves: vi.fn().mockResolvedValue(undefined),
    wikiOperationInServer: vi.fn().mockResolvedValue([]),
    wikiOperationInBrowser: vi.fn().mockResolvedValue([]),
  };
  const git = { commitAndSync: vi.fn().mockResolvedValue(true), syncOrForcePull: vi.fn().mockResolvedValue(true) };
  const restart = vi.fn().mockResolvedValue(undefined);
  const service = new Sync(
    { getStorageServiceUserInfo: vi.fn().mockResolvedValue({}) } as never,
    { get: vi.fn().mockResolvedValue(true) } as never,
    wiki as never,
    git as never,
    { track: vi.fn() } as never,
    { getSubWorkspacesAsList: vi.fn().mockResolvedValue([]) } as never,
    { restartWorkspaceViewService: restart } as never,
  );
  return { workspace, wiki, git, restart, service };
}

afterEach(() => vi.useRealTimers());

describe('sync save safety', () => {
  it.each([false, true])('does not run git when pending saves fail (force=%s)', async force => {
    const f = fixture();
    f.wiki.waitForPendingSaves.mockRejectedValue(new Error('unsaved changes'));
    await expect(f.service.syncWikiIfNeeded(f.workspace, { force })).rejects.toThrow('unsaved changes');
    expect(f.git.commitAndSync).not.toHaveBeenCalled();
    expect(f.git.syncOrForcePull).not.toHaveBeenCalled();
    expect(f.restart).not.toHaveBeenCalled();
  });

  it('waits for acknowledgement before committing even when drafts are allowed', async () => {
    const f = fixture();
    const saved = Promise.withResolvers<undefined>();
    f.wiki.waitForPendingSaves.mockReturnValue(saved.promise);
    const sync = f.service.syncWikiIfNeeded(f.workspace, { force: true });
    await Promise.resolve();
    expect(f.git.commitAndSync).not.toHaveBeenCalled();
    saved.resolve(undefined);
    await sync;
    expect(f.git.commitAndSync).toHaveBeenCalledOnce();
  });

  it('fails closed if the draft probe never answers', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.wiki.wikiOperationInServer.mockReturnValue(new Promise<never>(() => {}));
    const allowed = f.service.checkCanSyncDueToNoDraft(f.workspace.id);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(allowed).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not require a filesystem worker for an HTML workspace', async () => {
    const f = fixture();
    await f.service.syncWikiIfNeeded({ ...f.workspace, workspaceType: WorkspaceType.html }, { force: true });
    expect(f.wiki.waitForPendingSaves).not.toHaveBeenCalled();
    expect(f.git.commitAndSync).toHaveBeenCalledOnce();
  });
});
