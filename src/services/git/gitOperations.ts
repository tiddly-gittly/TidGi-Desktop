/**
 * Git operations using dugite
 * This module provides git log, checkout, revert functionality
 */
import { GitProcess } from 'dugite';
import type { IGitLogOptions, IGitLogResult } from './interface';

/**
 * Get git log with pagination
 */
export async function getGitLog(repoPath: string, options: IGitLogOptions = {}): Promise<IGitLogResult> {
  const { page = 0, pageSize = 100, searchQuery } = options;
  const skip = page * pageSize;

  // Check for uncommitted changes
  const statusResult = await GitProcess.exec(['status', '--porcelain'], repoPath);
  const hasUncommittedChanges = statusResult.stdout.trim().length > 0;

  // Build git log command arguments
  const logArguments = [
    'log',
    '--all',
    '--pretty=format:%H|%P|%D|%s|%ci|%an|%ae|%ai',
    '--date=iso',
    `--skip=${skip}`,
    `--max-count=${pageSize}`,
  ];

  // Add search query if provided
  if (searchQuery) {
    logArguments.push(`--grep=${searchQuery}`);
  }

  const result = await GitProcess.exec(logArguments, repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Git log failed: ${result.stderr}`);
  }

  // Get current branch
  const branchResult = await GitProcess.exec(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
  const currentBranch = branchResult.stdout.trim();

  // Get total count
  const countArguments = ['rev-list', '--all', '--count'];
  if (searchQuery) {
    countArguments.push(`--grep=${searchQuery}`);
  }
  const countResult = await GitProcess.exec(countArguments, repoPath);
  const totalCount = Number.parseInt(countResult.stdout.trim(), 10);

  // Parse log output
  const entries = result.stdout
    .trim()
    .split('\n')
    .filter((line: string) => line.length > 0)
    .map((line: string) => {
      const [hash, parents, references, message, committerDate, authorName, authorEmail, authorDate] = line.split('|');

      // Extract branch from refs (e.g., "HEAD -> main, origin/main")
      let branch = '';
      if (references) {
        const branchMatch = references.match(/(?:HEAD -> |origin\/)?([^,\s]+)/);
        branch = branchMatch ? branchMatch[1] : '';
      }

      return {
        hash,
        parents: parents.split(' ').filter((p: string) => p.length > 0),
        branch,
        message,
        committerDate,
        author: {
          name: authorName,
          email: authorEmail || undefined,
        },
        authorDate: authorDate || undefined,
      };
    });

  // Add uncommitted changes as first entry if any
  if (hasUncommittedChanges && page === 0) {
    const now = new Date().toISOString();
    entries.unshift({
      hash: '',
      parents: [],
      branch: currentBranch,
      message: '未提交的更改 / Uncommitted Changes',
      committerDate: now,
      author: {
        name: 'Local',
        email: undefined,
      },
      authorDate: now,
    });
  }

  return {
    entries,
    currentBranch,
    totalCount: totalCount + (hasUncommittedChanges ? 1 : 0),
  };
}

/**
 * Get files changed in a specific commit
 * If commitHash is empty, returns uncommitted changes
 */
export async function getCommitFiles(repoPath: string, commitHash: string): Promise<string[]> {
  // Handle uncommitted changes
  if (!commitHash || commitHash === '') {
    const result = await GitProcess.exec(['status', '--porcelain'], repoPath);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to get uncommitted files: ${result.stderr}`);
    }

    return result.stdout
      .trim()
      .split('\n')
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        // Parse git status format: "XY filename"
        // XY is two-letter status code, filename starts at position 3
        return line.substring(3).trim();
      });
  }

  const result = await GitProcess.exec(
    ['diff-tree', '--no-commit-id', '--name-only', '-r', commitHash],
    repoPath,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to get commit files: ${result.stderr}`);
  }

  return result.stdout
    .trim()
    .split('\n')
    .filter((line: string) => line.length > 0);
}

/**
 * Get diff for a specific file in a commit
 */
export async function getFileDiff(repoPath: string, commitHash: string, filePath: string): Promise<string> {
  const result = await GitProcess.exec(
    ['show', `${commitHash}:${filePath}`],
    repoPath,
  );

  if (result.exitCode !== 0) {
    // Try getting the diff another way
    const diffResult = await GitProcess.exec(
      ['diff', `${commitHash}^`, commitHash, '--', filePath],
      repoPath,
    );

    if (diffResult.exitCode !== 0) {
      throw new Error(`Failed to get file diff: ${diffResult.stderr}`);
    }

    return diffResult.stdout;
  }

  return result.stdout;
}

/**
 * Checkout a specific commit
 */
export async function checkoutCommit(repoPath: string, commitHash: string): Promise<void> {
  const result = await GitProcess.exec(['checkout', commitHash], repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to checkout commit: ${result.stderr}`);
  }
}

/**
 * Revert a specific commit
 */
export async function revertCommit(repoPath: string, commitHash: string): Promise<void> {
  const result = await GitProcess.exec(['revert', '--no-commit', commitHash], repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to revert commit: ${result.stderr}`);
  }

  // Commit the revert
  const commitResult = await GitProcess.exec(
    ['commit', '-m', `Revert commit ${commitHash}`],
    repoPath,
  );

  if (commitResult.exitCode !== 0) {
    throw new Error(`Failed to commit revert: ${commitResult.stderr}`);
  }
}
