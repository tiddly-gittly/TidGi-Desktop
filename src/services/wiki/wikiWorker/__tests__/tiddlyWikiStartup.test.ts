import { describe, expect, it, vi } from 'vitest';
import { waitForTiddlyWikiStartup } from '../tiddlyWikiStartup';

describe('waitForTiddlyWikiStartup', () => {
  it('resolves only after TiddlyWiki invokes the startup callback', async () => {
    let callback: (() => void) | undefined;
    const boot = {
      startup: vi.fn((options: { callback: () => void }) => {
        callback = options.callback;
      }),
    };
    let settled = false;
    const startup = waitForTiddlyWikiStartup(boot, '/boot').then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    callback?.();
    await startup;
    expect(settled).toBe(true);
    expect(boot.startup).toHaveBeenCalledWith({ bootPath: '/boot', callback: expect.any(Function) });
  });

  it('rejects a synchronous startup failure', async () => {
    const boot = {
      startup: vi.fn(() => {
        throw new Error('boot failed');
      }),
    };

    await expect(waitForTiddlyWikiStartup(boot, '/boot')).rejects.toThrow('boot failed');
  });
});
