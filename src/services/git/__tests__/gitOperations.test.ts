import { GitProcess } from 'dugite';
import { describe, expect, it, vi } from 'vitest';
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

describe('gitOperations', () => {
  describe('getGitLog', () => {
    it('should parse git log output correctly', async () => {
      const mockStdout = 'abc123||HEAD -> main|Initial commit|2024-01-01 00:00:00 +0000|Test User|test@example.com|2024-01-01 00:00:00 +0000';

      vi.mocked(GitProcess.exec).mockImplementation(async (args): Promise<IMockGitResult> => {
        if (args[0] === 'log') {
          return {
            exitCode: 0,
            stdout: mockStdout,
            stderr: '',
          };
        }
        if (args[0] === 'rev-parse') {
          return {
            exitCode: 0,
            stdout: 'main\n',
            stderr: '',
          };
        }
        if (args[0] === 'rev-list') {
          return {
            exitCode: 0,
            stdout: '1\n',
            stderr: '',
          };
        }
        return { exitCode: 1, stdout: '', stderr: 'Unknown command' };
      });

      const result = await gitOperations.getGitLog('/test/repo');

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        hash: 'abc123',
        message: 'Initial commit',
        branch: 'main',
      });
      expect(result.currentBranch).toBe('main');
      expect(result.totalCount).toBe(1);
    });

    it('should handle git log errors', async () => {
      vi.mocked(GitProcess.exec).mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'fatal: not a git repository',
      });

      await expect(gitOperations.getGitLog('/invalid/path')).rejects.toThrow(
        'Git log failed: fatal: not a git repository',
      );
    });

    it('should support pagination', async () => {
      vi.mocked(GitProcess.exec).mockImplementation(async (args): Promise<IMockGitResult> => {
        if (args[0] === 'log') {
          // Verify pagination arguments
          expect(args).toContain('--skip=20');
          expect(args).toContain('--max-count=10');
          return {
            exitCode: 0,
            stdout: '',
            stderr: '',
          };
        }
        return {
          exitCode: 0,
          stdout: 'main\n',
          stderr: '',
        };
      });

      await gitOperations.getGitLog('/test/repo', { page: 2, pageSize: 10 });

      expect(GitProcess.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['--skip=20', '--max-count=10']),
        '/test/repo',
      );
    });
  });

  describe('getCommitFiles', () => {
    it('should get files changed in a commit', async () => {
      vi.mocked(GitProcess.exec).mockResolvedValue({
        exitCode: 0,
        stdout: 'file1.ts\nfile2.ts\n',
        stderr: '',
      });

      const files = await gitOperations.getCommitFiles('/test/repo', 'abc123');

      expect(files).toEqual(['file1.ts', 'file2.ts']);
      expect(GitProcess.exec).toHaveBeenCalledWith(
        ['diff-tree', '--no-commit-id', '--name-only', '-r', 'abc123'],
        '/test/repo',
      );
    });

    it('should handle errors', async () => {
      vi.mocked(GitProcess.exec).mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'fatal: bad object abc123',
      });

      await expect(
        gitOperations.getCommitFiles('/test/repo', 'invalid'),
      ).rejects.toThrow('Failed to get commit files: fatal: bad object abc123');
    });
  });

  describe('checkoutCommit', () => {
    it('should checkout a commit', async () => {
      vi.mocked(GitProcess.exec).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      await gitOperations.checkoutCommit('/test/repo', 'abc123');

      expect(GitProcess.exec).toHaveBeenCalledWith(
        ['checkout', 'abc123'],
        '/test/repo',
      );
    });

    it('should handle checkout errors', async () => {
      vi.mocked(GitProcess.exec).mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'error: pathspec abc123 did not match any file(s) known to git',
      });

      await expect(
        gitOperations.checkoutCommit('/test/repo', 'invalid'),
      ).rejects.toThrow('Failed to checkout commit');
    });
  });

  describe('revertCommit', () => {
    it('should revert a commit', async () => {
      vi.mocked(GitProcess.exec).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      await gitOperations.revertCommit('/test/repo', 'abc123');

      expect(GitProcess.exec).toHaveBeenCalledWith(
        ['revert', '--no-commit', 'abc123'],
        '/test/repo',
      );
      expect(GitProcess.exec).toHaveBeenCalledWith(
        ['commit', '-m', 'Revert commit abc123'],
        '/test/repo',
      );
    });

    it('should handle revert errors', async () => {
      vi.mocked(GitProcess.exec)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'error: commit failed',
        });

      await expect(
        gitOperations.revertCommit('/test/repo', 'abc123'),
      ).rejects.toThrow('Failed to commit revert');
    });
  });
});
