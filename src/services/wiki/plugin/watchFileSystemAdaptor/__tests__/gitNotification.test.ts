import { describe, expect, it, vi } from 'vitest';
import { type GitFileChangeNotifier, notifyGitFileChangeBestEffort } from '../gitNotification';

describe('notifyGitFileChangeBestEffort', () => {
  it('contains a delayed utility-process service timeout', async () => {
    const timeout = new Error('Service call timeout: GitChannel.notifyFileChange');
    const notifier: GitFileChangeNotifier = {
      notifyFileChange: vi.fn().mockRejectedValue(timeout),
    };
    const onError = vi.fn();

    await expect(notifyGitFileChangeBestEffort(notifier, '/wiki', onError)).resolves.toBeUndefined();

    expect(notifier.notifyFileChange).toHaveBeenCalledWith('/wiki', { onlyWhenGitLogOpened: true });
    expect(onError).toHaveBeenCalledWith(timeout);
  });

  it('contains a synchronous detached-transport failure', async () => {
    const notifier: GitFileChangeNotifier = {
      notifyFileChange: vi.fn(() => {
        throw new Error('transport detached');
      }),
    };

    await expect(notifyGitFileChangeBestEffort(notifier, '/wiki')).resolves.toBeUndefined();
  });
});
