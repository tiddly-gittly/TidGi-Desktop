import { GitProcess } from 'dugite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as gitOperations from '../gitOperations';

vi.mock('dugite', () => ({
  GitProcess: {
    exec: vi.fn(),
  },
}));

interface IMockGitResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

describe('gitOperations - getFileDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get file diff successfully', async () => {
    vi.mocked(GitProcess.exec).mockResolvedValue({
      exitCode: 0,
      stdout: 'diff --git a/file.ts b/file.ts\n+added line\n-removed line',
      stderr: '',
    });

    const diff = await gitOperations.getFileDiff('/test/repo', 'abc123', 'file.ts');

    expect(diff).toContain('+added line');
    expect(diff).toContain('-removed line');
  });

  it('should handle errors when file diff fails', async () => {
    vi.mocked(GitProcess.exec).mockImplementation(async (_arguments): Promise<IMockGitResult> => {
      // Both attempts fail
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'fatal: bad object',
      };
    });

    await expect(
      gitOperations.getFileDiff('/test/repo', 'abc123', 'file.ts'),
    ).rejects.toThrow('Failed to get file diff');
  });

  it('should try alternative diff method when first attempt fails', async () => {
    let callCount = 0;
    vi.mocked(GitProcess.exec).mockImplementation(async (_arguments): Promise<IMockGitResult> => {
      callCount++;
      if (callCount === 1) {
        // First call fails
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'fatal: not found',
        };
      }
      // Second call succeeds with diff
      return {
        exitCode: 0,
        stdout: 'diff content',
        stderr: '',
      };
    });

    const diff = await gitOperations.getFileDiff('/test/repo', 'abc123', 'file.ts');

    expect(diff).toBe('diff content');
    expect(GitProcess.exec).toHaveBeenCalledTimes(2);
  });
});
