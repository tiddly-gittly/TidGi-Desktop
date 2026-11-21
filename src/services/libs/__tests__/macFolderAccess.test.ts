import { afterEach, describe, expect, it, vi } from 'vitest';
import { MacFolderAccess } from '../macFolderAccess';

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createAccess(readDirectory = vi.fn().mockResolvedValue(undefined), platform: NodeJS.Platform = 'darwin') {
  return new MacFolderAccess({ platform, protectedFolders: () => ['/Users/test/Desktop', '/Users/test/Documents', '/Users/test/Downloads'], readDirectory });
}

describe('macOS folder access consent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not probe other platforms or similarly named unprotected folders', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    await createAccess(read, 'linux').waitForAccess('/Users/test/Desktop/wiki');
    await createAccess(read).waitForAccess('/Users/test/Desktop-backup/wiki');
    expect(read).not.toHaveBeenCalled();
  });

  it('waits beyond boot deadlines and shares one consent request per protected folder', async () => {
    vi.useFakeTimers();
    const consent = deferred();
    const read = vi.fn(() => consent.promise);
    const access = createAccess(read);
    let completed = false;
    const first = access.waitForAccess('/Users/test/Desktop/wiki').then(() => {
      completed = true;
    });
    const second = access.waitForAccess('/Users/test/Desktop/calendar');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(completed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(read).toHaveBeenCalledTimes(1);
    consent.resolve();
    await Promise.all([first, second]);
    await access.waitForAccess('/Users/test/Desktop/another-wiki');
    expect(completed).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('allows a denied request to be retried after settings change', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('EACCES')).mockResolvedValue(undefined);
    const access = createAccess(read);
    await expect(access.waitForAccess('/Users/test/Documents/wiki')).rejects.toThrow('EACCES');
    await expect(access.waitForAccess('/Users/test/Documents/wiki')).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('cancels a shutdown waiter without cancelling another caller or leaking a late rejection', async () => {
    const consent = deferred();
    const access = createAccess(vi.fn(() => consent.promise));
    const controller = new AbortController();
    const cancelled = access.waitForAccess('/Users/test/Downloads/wiki', controller.signal);
    const other = access.waitForAccess('/Users/test/Downloads/wiki');
    const cancellation = expect(cancelled).rejects.toThrow('shutdown');
    controller.abort(new Error('shutdown'));
    await cancellation;
    const denial = expect(other).rejects.toThrow('denied');
    consent.reject(new Error('denied'));
    await denial;
  });

  it('does not start a consent request for an already cancelled caller', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    controller.abort(new Error('shutdown'));
    await expect(createAccess(read).waitForAccess('/Users/test/Desktop/wiki', controller.signal)).rejects.toThrow('shutdown');
    expect(read).not.toHaveBeenCalled();
  });
});
