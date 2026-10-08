import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWikiWorkerLifecycleMessage, releaseWorkerServicesAfterSubscriberReady, WikiWorkerLifecycleTracker } from '../workerLifecycle';

describe('WikiWorkerLifecycleTracker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not release services until the utility observable subscriber is ready', async () => {
    const tracker = new WikiWorkerLifecycleTracker('wiki-a', 'generation-a');
    const notifyServicesReady = vi.fn().mockResolvedValue(undefined);
    const release = releaseWorkerServicesAfterSubscriberReady(tracker, notifyServicesReady);

    await Promise.resolve();
    expect(notifyServicesReady).not.toHaveBeenCalled();

    tracker.accept(createWikiWorkerLifecycleMessage('subscriber-ready', 'generation-a', 'wiki-a'));
    await release;
    expect(notifyServicesReady).toHaveBeenCalledOnce();
  });

  it('replays an early boot signal to a later waiter and ignores duplicate frames', async () => {
    const tracker = new WikiWorkerLifecycleTracker('wiki-a', 'generation-a');
    expect(tracker.accept(createWikiWorkerLifecycleMessage('booted', 'generation-a', 'wiki-a'))).toBe(true);
    expect(tracker.accept(createWikiWorkerLifecycleMessage('booted', 'generation-a', 'wiki-a'))).toBe(true);

    await expect(tracker.booted).resolves.toBeUndefined();
  });

  it('ignores late signals from an earlier worker generation', async () => {
    const tracker = new WikiWorkerLifecycleTracker('wiki-a', 'generation-new');
    expect(tracker.accept(createWikiWorkerLifecycleMessage('subscriber-ready', 'generation-old', 'wiki-a'))).toBe(false);
    expect(tracker.accept(createWikiWorkerLifecycleMessage('booted', 'generation-old', 'wiki-a'))).toBe(false);

    const notifyServicesReady = vi.fn().mockResolvedValue(undefined);
    const release = releaseWorkerServicesAfterSubscriberReady(tracker, notifyServicesReady);
    await Promise.resolve();
    expect(notifyServicesReady).not.toHaveBeenCalled();

    tracker.accept(createWikiWorkerLifecycleMessage('subscriber-ready', 'generation-new', 'wiki-a'));
    tracker.accept(createWikiWorkerLifecycleMessage('booted', 'generation-new', 'wiki-a'));
    await release;
    await expect(tracker.booted).resolves.toBeUndefined();
  });

  it('fails boundedly when the utility observable never acknowledges its subscriber', async () => {
    vi.useFakeTimers();
    const tracker = new WikiWorkerLifecycleTracker('wiki-a', 'generation-a');
    const notifyServicesReady = vi.fn().mockResolvedValue(undefined);
    const release = releaseWorkerServicesAfterSubscriberReady(tracker, notifyServicesReady, 10_000);
    const rejection = expect(release).rejects.toThrow('subscriber ACK timed out');

    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(notifyServicesReady).not.toHaveBeenCalled();
  });
});
