/**
 * Git operations using dugite
 * This module provides git log, checkout, revert functionality
 */
import { i18n } from '@services/libs/i18n';
import { exec as gitExec } from 'dugite';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IGitLogOptions, IGitLogResult } from './interface';

/**
 * Get git log with pagination
 */
export async function getGitLog(repoPath: string, options: IGitLogOptions = {}): Promise<IGitLogResult> {
  const { page = 0, pageSize = 100, searchQuery } = options;
  const skip = page * pageSize;

  // Check for uncommitted changes
  const statusResult = await gitExec(['status', '--porcelain'], repoPath);
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

  const result = await gitExec(logArguments, repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Git log failed: ${result.stderr}`);
  }

  // Get current branch
  const branchResult = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
  const currentBranch = branchResult.stdout.trim();

  // Get total count
  const countArguments = ['rev-list', '--all', '--count'];
  if (searchQuery) {
    countArguments.push(`--grep=${searchQuery}`);
  }
  const countResult = await gitExec(countArguments, repoPath);
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
      message: i18n.t('ContextMenu.UncommittedChanges'),
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
    const result = await gitExec(['status', '--porcelain'], repoPath);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to get uncommitted files: ${result.stderr}`);
    }

    return result.stdout
      .split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        if (line.length <= 3) {
          return line.trim();
        }

        // Parse git status format: "XY filename"
        // XY is two-letter status code, filename starts at position 3
        const rawPath = line.slice(3);

        // Handle rename format: "old -> new" – we want the new path
        const renameParts = rawPath.split(' -> ');
        return renameParts[renameParts.length - 1].trim();
      })
      .filter((line: string) => line.length > 0);
  }

  const result = await gitExec(
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
 * @param maxLines - Maximum number of lines to return (default: 500)
 * @param maxChars - Maximum number of characters to return (default: 10000)
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];

export async function getFileDiff(
  repoPath: string,
  commitHash: string,
  filePath: string,
  maxLines = 500,
  maxChars = 10000,
): Promise<import('./interface').IFileDiffResult> {
  if (!commitHash) {
    const statusResult = await gitExec(['status', '--porcelain', '--', filePath], repoPath);

    if (statusResult.exitCode !== 0) {
      throw new Error(`Failed to get status for working tree diff: ${statusResult.stderr}`);
    }

    const statusLine = statusResult.stdout.trim().split(/\r?\n/).find(Boolean) ?? '';
    const statusCode = statusLine.slice(0, 2);
    const isUntracked = statusCode === '??';
    const isImage = IMAGE_EXTENSIONS.some(extension => filePath.toLowerCase().endsWith(extension));

    if (isUntracked) {
      if (isImage) {
        return {
          content: `Binary files /dev/null and b/${filePath} differ`,
          isTruncated: false,
        };
      }

      try {
        const content = await fs.readFile(path.join(repoPath, filePath), 'utf-8');
        const diff = [
          `diff --git a/${filePath} b/${filePath}`,
          'new file mode 100644',
          '--- /dev/null',
          `+++ b/${filePath}`,
          ...content.split(/\r?\n/).map(line => `+${line}`),
        ].join('\n');
        return truncateDiff(diff, maxLines, maxChars);
      } catch (error) {
        console.error('[getFileDiff] Failed to read untracked file content:', error);
        return {
          content: createBinaryDiffPlaceholder(filePath),
          isTruncated: false,
        };
      }
    }

    const result = await gitExec(
      ['diff', 'HEAD', '--', filePath],
      repoPath,
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to get working tree diff: ${result.stderr}`);
    }

    if (isImage) {
      const trimmed = result.stdout.trim();
      if (trimmed.length === 0) {
        return {
          content: createBinaryDiffPlaceholder(filePath),
          isTruncated: false,
        };
      }
    }

    return truncateDiff(result.stdout, maxLines, maxChars);
  }

  // Use git show with --pretty=format: to get only the diff without commit message
  const result = await gitExec(
    ['show', '--pretty=format:', commitHash, '--', filePath],
    repoPath,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to get file diff: ${result.stderr}`);
  }

  return truncateDiff(result.stdout, maxLines, maxChars);
}

/**
 * Get the content of a specific file at a commit
 * @param maxLines - Maximum number of lines to return (default: 500)
 * @param maxChars - Maximum number of characters to return (default: 10000)
 */
export async function getFileContent(
  repoPath: string,
  commitHash: string,
  filePath: string,
  maxLines = 500,
  maxChars = 10000,
): Promise<import('./interface').IFileDiffResult> {
  if (!commitHash) {
    const absolutePath = path.join(repoPath, filePath);

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      return truncateContent(content, maxLines, maxChars);
    } catch (error) {
      throw new Error(`Failed to read working tree file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Use git show to get the file content at the specific commit
  const result = await gitExec(
    ['show', `${commitHash}:${filePath}`],
    repoPath,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to get file content: ${result.stderr}`);
  }

  return truncateContent(result.stdout, maxLines, maxChars);
}

/**
 * Get binary file content (e.g., images) from a commit as base64 data URL
 * Similar to GitHub Desktop's getBlobImage implementation
 * Reference: https://github.com/desktop/desktop/blob/main/app/src/lib/git/show.ts
 */
export async function getFileBinaryContent(
  repoPath: string,
  commitHash: string,
  filePath: string,
): Promise<string> {
  if (!commitHash) {
    try {
      const fullPath = path.join(repoPath, filePath);
      const buffer = await fs.readFile(fullPath);
      return bufferToDataUrl(buffer, filePath);
    } catch (error) {
      throw new Error(`Failed to read binary file from working tree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Use gitExec with encoding: 'buffer' to get binary data as Buffer
  // This is the same approach GitHub Desktop uses in getBlobContents
  const result = await gitExec(
    ['show', `${commitHash}:${filePath}`],
    repoPath,
    {
      encoding: 'buffer' as const, // dugite 3.x supports this option
    },
  );

  if (result.exitCode !== 0) {
    const errorMessage = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf-8') : String(result.stderr);
    console.error('[getFileBinaryContent] Git error:', errorMessage);
    throw new Error(`Failed to get binary file content: ${errorMessage}`);
  }

  // When encoding is 'buffer', stdout is a Buffer (dugite 3.x)
  const buffer = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout), 'binary');
  console.log('[getFileBinaryContent] Buffer size:', buffer.length);

  return bufferToDataUrl(buffer, filePath);
}

/**
 * Get binary image comparison data for a file change
 * Returns both previous and current versions of the image
 * Reference: GitHub Desktop's getImageDiff implementation
 */
export async function getImageComparison(
  repoPath: string,
  commitHash: string,
  filePath: string,
): Promise<{ previous: string | null; current: string | null }> {
  // Get current version (at this commit)
  let current: string | null = null;
  try {
    current = await getFileBinaryContent(repoPath, commitHash, filePath);
  } catch {
    // File might be deleted in this commit
  }

  // Get previous version (at parent commit)
  let previous: string | null = null;
  try {
    if (!commitHash) {
      // Compare working tree (current) with HEAD
      try {
        previous = await getFileBinaryContent(repoPath, 'HEAD', filePath);
      } catch {
        // File does not exist in HEAD (newly added)
      }
    } else {
      // Get parent commit hash
      const parentResult = await gitExec(
        ['rev-parse', `${commitHash}^`],
        repoPath,
      );

      if (parentResult.exitCode === 0) {
        const parentHash = parentResult.stdout.trim();
        try {
          previous = await getFileBinaryContent(repoPath, parentHash, filePath);
        } catch {
          // File might be newly added in this commit
        }
      }
    }
  } catch {
    // This is the initial commit, no parent
  }

  return { previous, current };
}

function bufferToDataUrl(buffer: Buffer, filePath: string): string {
  const base64 = buffer.toString('base64');
  const extension = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
  };
  const mimeType = mimeTypes[extension || ''] || 'application/octet-stream';

  return `data:${mimeType};base64,${base64}`;
}

function createBinaryDiffPlaceholder(filePath: string): string {
  return `Binary files HEAD and working tree differ (${filePath})`;
}

/**
 * Truncate diff output if it exceeds the limits
 */

function truncateDiff(diff: string, maxLines: number, maxChars: number): import('./interface').IFileDiffResult {
  let truncated = diff;
  let isTruncated = false;

  // Check character limit first
  if (truncated.length > maxChars) {
    truncated = truncated.slice(0, maxChars);
    isTruncated = true;
  }

  // Check line limit
  const lines = truncated.split('\n');
  if (lines.length > maxLines) {
    truncated = lines.slice(0, maxLines).join('\n');
    isTruncated = true;
  }

  return {
    content: truncated,
    isTruncated,
  };
}

/**
 * Truncate content if it exceeds the limits
 */
function truncateContent(content: string, maxLines: number, maxChars: number): import('./interface').IFileDiffResult {
  return truncateDiff(content, maxLines, maxChars);
}

/**
 * Checkout a specific commit
 */
export async function checkoutCommit(repoPath: string, commitHash: string): Promise<void> {
  const result = await gitExec(['checkout', commitHash], repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to checkout commit: ${result.stderr}`);
  }
}

/**
 * Revert a specific commit
 * @param commitMessage - The original commit message to include in the revert message
 */
export async function revertCommit(repoPath: string, commitHash: string, commitMessage?: string): Promise<void> {
  const result = await gitExec(['revert', '--no-commit', commitHash], repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to revert commit: ${result.stderr}`);
  }

  // Create revert commit message with the original commit message
  const revertMessage = commitMessage
    ? i18n.t('ContextMenu.RevertCommit', { message: commitMessage })
    : `Revert commit ${commitHash}`;

  // Commit the revert
  const commitResult = await gitExec(
    ['commit', '-m', revertMessage],
    repoPath,
  );

  if (commitResult.exitCode !== 0) {
    throw new Error(`Failed to commit revert: ${commitResult.stderr}`);
  }
}

/**
 * Discard changes for a specific file (restore from HEAD)
 */
export async function discardFileChanges(repoPath: string, filePath: string): Promise<void> {
  const result = await gitExec(['checkout', 'HEAD', '--', filePath], repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to discard changes: ${result.stderr}`);
  }
}

/**
 * Add a file pattern to .gitignore
 */
export async function addToGitignore(repoPath: string, pattern: string): Promise<void> {
  const gitignorePath = `${repoPath}/.gitignore`;

  try {
    // Read existing .gitignore or create new
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // File doesn't exist, will create new
    }

    // Check if pattern already exists
    const lines = content.split('\n');
    if (lines.some(line => line.trim() === pattern)) {
      return; // Pattern already exists
    }

    // Add pattern (ensure file ends with newline)
    const newContent = content.trim() + (content ? '\n' : '') + pattern + '\n';
    await fs.writeFile(gitignorePath, newContent, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to update .gitignore: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Amend the last commit with a new message
 */
export async function amendCommitMessage(repoPath: string, newMessage: string): Promise<void> {
  const result = await gitExec(['commit', '--amend', '-m', newMessage], repoPath);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to amend commit message: ${result.stderr}`);
  }
}
