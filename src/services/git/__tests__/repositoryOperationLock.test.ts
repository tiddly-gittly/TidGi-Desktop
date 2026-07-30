import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { Git } from '..';

vi.mock('../gitWorker?utilityProcess', () => ({ default: vi.fn() }));

type LockableGit = {
  acquireOperationLock: (repoPath: string) => Promise<() => void>;
  operationLocks: Map<string, Promise<void>>;
};

describe('Git repository operation lock', () => {
  it('queues all waiters for the same normalized repository in arrival order', async () => {
    const git = Object.create(Git.prototype) as LockableGit;
    git.operationLocks = new Map();
    const repoPath = path.join(process.cwd(), 'test-artifacts', 'shared-repository');
    const firstRelease = await git.acquireOperationLock(repoPath);
    const acquired: string[] = ['first'];

    const second = git.acquireOperationLock(path.join(repoPath, '.')).then(release => {
      acquired.push('second');
      return release;
    });
    const third = git.acquireOperationLock(repoPath).then(release => {
      acquired.push('third');
      return release;
    });

    await Promise.resolve();
    expect(acquired).toEqual(['first']);

    firstRelease();
    const secondRelease = await second;
    expect(acquired).toEqual(['first', 'second']);

    secondRelease();
    const thirdRelease = await third;
    expect(acquired).toEqual(['first', 'second', 'third']);
    thirdRelease();
    expect(git.operationLocks).toHaveLength(0);
  });
});
