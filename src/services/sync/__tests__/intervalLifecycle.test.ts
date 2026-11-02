// @vitest-environment node
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { Sync } from '..';

describe('workspace sync interval lifecycle', () => {
  const workspace = { id: 'calendar', wikiFolderLocation: '/wiki/calendar', syncOnInterval: true } as IWikiWorkspace;
  let service: Sync;
  let getInterval: ReturnType<typeof vi.fn<() => Promise<number>>>;
  let sync: MockInstance<Sync['syncWikiIfNeeded']>;

  beforeEach(() => {
    vi.useFakeTimers();
    getInterval = vi.fn(async () => 1000);
    service = new Sync({} as never, { get: getInterval } as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    sync = vi.spyOn(service, 'syncWikiIfNeeded').mockResolvedValue(undefined);
  });

  afterEach(() => {
    service.clearAllSyncIntervals();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops Node object timers', async () => {
    const start = vi.spyOn(globalThis, 'setInterval');
    await service.startIntervalSyncIfNeeded(workspace);
    expect(typeof start.mock.results[0].value).toBe('object');
    service.stopIntervalSync(workspace.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sync).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces repeated startup and clears every workspace interval', async () => {
    await service.startIntervalSyncIfNeeded(workspace);
    await service.startIntervalSyncIfNeeded(workspace);
    await service.startIntervalSyncIfNeeded({ ...workspace, id: 'main' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).toHaveBeenCalledTimes(2);
    service.clearAllSyncIntervals();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turning off both sync and backup stops an existing interval', async () => {
    await service.startIntervalSyncIfNeeded(workspace);
    await service.startIntervalSyncIfNeeded({ ...workspace, syncOnInterval: false, backupOnInterval: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).not.toHaveBeenCalled();
  });

  it('handles a failed save drain and retries on the next interval', async () => {
    sync.mockRejectedValueOnce(new Error('unsaved changes'));
    await service.startIntervalSyncIfNeeded(workspace);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it.each(['stop', 'clearAll'] as const)('does not restart after %s while preferences load', async action => {
    const pending = Promise.withResolvers<number>();
    getInterval.mockReturnValueOnce(pending.promise);
    const starting = service.startIntervalSyncIfNeeded(workspace);
    if (action === 'stop') service.stopIntervalSync(workspace.id);
    else service.clearAllSyncIntervals();
    pending.resolve(1000);
    await starting;
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps only the latest startup when preference reads finish out of order', async () => {
    const pending = Promise.withResolvers<number>();
    getInterval.mockReturnValueOnce(pending.promise);
    const first = service.startIntervalSyncIfNeeded(workspace);
    const updated = { ...workspace, name: 'updated' };
    await service.startIntervalSyncIfNeeded(updated);
    pending.resolve(1000);
    await first;
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).toHaveBeenCalledExactlyOnceWith(updated);
    service.clearAllSyncIntervals();
    expect(vi.getTimerCount()).toBe(0);
  });
});
