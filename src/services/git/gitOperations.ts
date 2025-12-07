/**
 * Git operations using dugite
 * This module provides git log, checkout, revert functionality
 */
import { i18n } from '@services/libs/i18n';
import { exec as gitExec } from 'dugite';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defaultGitInfo } from './defaultGitInfo';
import type { GitFileStatus, IFileDiffResult, IGitLogOptions, IGitLogResult } from './interface';

/**
 * Helper to create git environment variables for commit operations
 * This ensures commits work in environments without git config (like CI)
 */
function getGitCommitEnvironment(username: string = defaultGitInfo.gitUserName, email: string = defaultGitInfo.email) {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: username,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: username,
    GIT_COMMITTER_EMAIL: email,
  };
}

/**
 * Get git log with pagination
 */
export async function getGitLog(repoPath: string, options: IGitLogOptions = {}): Promise<IGitLogResult> {
  const { page = 0, pageSize = 100, searchQuery, searchMode = 'none', filePath, since, until } = options;
  const skip = page * pageSize;

  // Check for uncommitted changes (only in normal mode)
  const statusResult = await gitExec(['-c', 'core.quotePath=false', 'status', '--porcelain'], repoPath);
  const hasUncommittedChanges = statusResult.stdout.trim().length > 0 && searchMode === 'none';

  // Build git log command arguments
  const logArguments = [
    'log',
    '--all',
    '--pretty=format:%H|%P|%D|%s|%ci|%an|%ae|%ai',
    '--date=iso',
    `--skip=${skip}`,
    `--max-count=${pageSize}`,
  ];

  // Add search filters based on mode
  if (searchMode === 'message' && searchQuery) {
    logArguments.push(`--grep=${searchQuery}`, '-i'); // -i for case-insensitive
  } else if (searchMode === 'file' && filePath) {
    // File path search - shows commits that modified files matching the pattern
    // Support glob patterns like *.tsx or *pages*
    const pattern = filePath.includes('*') ? filePath : `*${filePath}*`;
    logArguments.push('--', pattern);
  } else if (searchMode === 'dateRange') {
    if (since) {
      logArguments.push(`--since=${since}`);
    }
    if (until) {
      logArguments.push(`--until=${until}`);
    }
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
  if (searchMode === 'message' && searchQuery) {
    countArguments.push(`--grep=${searchQuery}`, '-i'); // -i for case-insensitive
  } else if (searchMode === 'file' && filePath) {
    const pattern = filePath.includes('*') ? filePath : `*${filePath}*`;
    countArguments.push('--', pattern);
  } else if (searchMode === 'dateRange') {
    if (since) {
      countArguments.push(`--since=${since}`);
    }
    if (until) {
      countArguments.push(`--until=${until}`);
    }
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
 * Parse git status code to file status
 * Handles both git status --porcelain (two-character codes like "M ", " D", "??")
 * and git diff-tree --name-status (single-character codes like "M", "D", "A")
 */
function parseGitStatusCode(statusCode: string): GitFileStatus {
  // Handle single-character status codes from diff-tree
  if (statusCode.length === 1) {
    if (statusCode === 'A') return 'added';
    if (statusCode === 'M') return 'modified';
    if (statusCode === 'D') return 'deleted';
    if (statusCode.startsWith('R')) return 'renamed';
    if (statusCode.startsWith('C')) return 'copied';
    return 'unknown';
  }

  // Handle two-character status codes from git status --porcelain
  const index = statusCode[0];
  const workTree = statusCode[1];

  // Check for specific patterns
  if (statusCode === '??') return 'untracked';
  if (index === 'A' || workTree === 'A') return 'added';
  if (index === 'D' || workTree === 'D') return 'deleted';
  if (index === 'R' || workTree === 'R') return 'renamed';
  if (index === 'C' || workTree === 'C') return 'copied';
  if (index === 'M' || workTree === 'M') return 'modified';

  return 'unknown';
}

/**
 * Get files changed in a specific commit
 * If commitHash is empty, returns uncommitted changes
 */
export async function getCommitFiles(repoPath: string, commitHash: string): Promise<Array<import('./interface').IFileWithStatus>> {
  // Handle uncommitted changes
  if (!commitHash || commitHash === '') {
    const result = await gitExec(['-c', 'core.quotePath=false', 'status', '--porcelain'], repoPath);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to get uncommitted files: ${result.stderr}`);
    }

    return result.stdout
      .split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        if (line.length <= 3) {
          return { path: line.trim(), status: 'unknown' as const };
        }

        // Parse git status format: "XY filename"
        // XY is two-letter status code, filename starts at position 3
        const statusCode = line.slice(0, 2);
        const rawPath = line.slice(3);

        // Handle rename format: "old -> new" – we want the new path
        const renameParts = rawPath.split(' -> ');
        const filePath = renameParts[renameParts.length - 1].trim();

        return {
          path: filePath,
          status: parseGitStatusCode(statusCode),
        };
      })
      .filter((item) => item.path.length > 0);
  }

  // For committed changes, use diff-tree with --name-status to get file status
  const result = await gitExec(
    ['-c', 'core.quotePath=false', 'diff-tree', '--no-commit-id', '--name-status', '-r', commitHash],
    repoPath,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to get commit files: ${result.stderr}`);
  }

  return result.stdout
    .trim()
    .split('\n')
    .filter((line: string) => line.length > 0)
    .map((line: string) => {
      // Format: "STATUS\tFILENAME" or "STATUS\tOLDNAME\tNEWNAME" for renames
      const parts = line.split('\t');
      const statusChar = parts[0];
      const filePath = parts[parts.length - 1]; // Use last part for renames

      return { path: filePath, status: parseGitStatusCode(statusChar) };
    });
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
    const statusResult = await gitExec(['-c', 'core.quotePath=false', 'status', '--porcelain', '--', filePath], repoPath);

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

    // Check if file is deleted
    const isDeleted = statusCode.includes('D');

    if (isDeleted) {
      // For deleted files, show the deletion diff
      const result = await gitExec(
        ['diff', 'HEAD', '--', filePath],
        repoPath,
      );

      if (result.exitCode !== 0) {
        // If diff fails, try to show the file content from HEAD
        const headContent = await gitExec(
          ['show', `HEAD:${filePath}`],
          repoPath,
        );

        if (headContent.exitCode === 0) {
          const diff = [
            `diff --git a/${filePath} b/${filePath}`,
            'deleted file mode 100644',
            `--- a/${filePath}`,
            '+++ /dev/null',
            ...headContent.stdout.split(/\r?\n/).map(line => `-${line}`),
          ].join('\n');
          return truncateDiff(diff, maxLines, maxChars);
        }

        throw new Error(`Failed to get diff for deleted file: ${result.stderr}`);
      }

      return truncateDiff(result.stdout, maxLines, maxChars);
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
      // Try to read the file directly
      const content = await fs.readFile(absolutePath, 'utf-8');
      return truncateContent(content, maxLines, maxChars);
    } catch (error) {
      // File doesn't exist or can't be read - it might be deleted
      // Try to get from HEAD
      try {
        const result = await gitExec(
          ['show', `HEAD:${filePath}`],
          repoPath,
        );

        if (result.exitCode === 0) {
          return truncateContent(result.stdout, maxLines, maxChars);
        }
      } catch {
        // Silently fail and throw main error
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read file: ${errorMessage}`);
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

function truncateDiff(diff: string, maxLines: number, maxChars: number): IFileDiffResult {
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
 * Truncate content output if it exceeds the limits
 */
function truncateContent(content: string, maxLines: number, maxChars: number): IFileDiffResult {
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

  // Commit the revert with author/committer identity
  const commitResult = await gitExec(
    ['commit', '-m', revertMessage],
    repoPath,
    {
      env: getGitCommitEnvironment(),
    },
  );

  if (commitResult.exitCode !== 0) {
    throw new Error(`Failed to commit revert: ${commitResult.stderr}`);
  }
}

/**
 * Discard changes for a specific file (restore from HEAD or delete if untracked)
 */
export async function discardFileChanges(repoPath: string, filePath: string): Promise<void> {
  // First check the file status to determine if it's untracked (new file)
  const statusResult = await gitExec(['-c', 'core.quotePath=false', 'status', '--porcelain', '--', filePath], repoPath);

  if (statusResult.exitCode !== 0) {
    throw new Error(`Failed to check file status: ${statusResult.stderr}`);
  }

  const statusLine = statusResult.stdout.trim();

  // If empty, file is not modified
  if (!statusLine) {
    return;
  }

  // Parse status code (first two characters)
  const statusCode = statusLine.slice(0, 2);

  // Check if file is untracked (new file not yet added)
  // Status code "??" means untracked
  if (statusCode === '??') {
    // For untracked files, we need to delete them
    const fullPath = path.join(repoPath, filePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      throw new Error(`Failed to delete untracked file: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // For tracked files, use git checkout to restore from HEAD
    const result = await gitExec(['checkout', 'HEAD', '--', filePath], repoPath);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to discard changes: ${result.stderr}`);
    }
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
  const result = await gitExec(
    ['commit', '--amend', '-m', newMessage],
    repoPath,
    {
      env: getGitCommitEnvironment(),
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to amend commit message: ${result.stderr}`);
  }
}

/**
 * Get deleted tiddler titles from git history since a specific date
 * This looks for deleted .tid and .meta files and extracts their title field
 * @param repoPath - Path to the git repository
 * @param sinceDate - Date to check for deletions after this time
 * @returns Array of deleted tiddler titles
 */
export async function getDeletedTiddlersSinceDate(repoPath: string, sinceDate: Date): Promise<string[]> {
  try {
    // Format date for git log (ISO format)
    const sinceISOString = sinceDate.toISOString();

    // Get list of deleted files since sinceDate
    // Using git log with --diff-filter=D to show only deletions
    const logResult = await gitExec(
      ['-c', 'core.quotePath=false', 'log', `--since=${sinceISOString}`, '--diff-filter=D', '--name-only', '--pretty=format:'],
      repoPath,
    );

    if (logResult.exitCode !== 0) {
      throw new Error(`Failed to get deleted files: ${logResult.stderr}`);
    }

    const deletedFiles = logResult.stdout
      .trim()
      .split('\n')
      .filter((line: string) => line.length > 0)
      .filter((file: string) => file.endsWith('.tid') || file.endsWith('.meta'));

    if (deletedFiles.length === 0) {
      return [];
    }

    // For each deleted file, get its content from git history to extract the title
    // Parallelize git operations for efficiency (avoid serial git exec calls)
    const deletedTitlePromises = deletedFiles.map(async (file) => {
      try {
        // Get the last commit that had this file (before deletion)
        const revListResult = await gitExec(
          ['rev-list', '-n', '1', 'HEAD', '--', file],
          repoPath,
        );

        if (revListResult.exitCode !== 0 || !revListResult.stdout.trim()) {
          return null;
        }

        const lastCommitHash = revListResult.stdout.trim();

        // Get the file content from that commit
        const showResult = await gitExec(
          ['show', `${lastCommitHash}:${file}`],
          repoPath,
        );

        if (showResult.exitCode !== 0) {
          return null;
        }

        return extractTitleFromTiddlerContent(showResult.stdout);
      } catch (error) {
        console.error(`Error processing deleted file ${file}:`, error);
        return null;
      }
    });

    const deletedTitles = await Promise.all(deletedTitlePromises);

    // Remove nulls and duplicates
    return [...new Set(deletedTitles.filter((title): title is string => title !== null))];
  } catch (error) {
    console.error('Error getting deleted tiddlers:', error);
    return [];
  }
}

/**
 * Get tiddler content at a specific point in time from git history
 * This is used for 3-way merge to get the base version
 * @param repoPath - Path to the git repository
 * @param tiddlerTitle - Title of the tiddler
 * @param beforeDate - Get the version that existed before this date
 * @returns Tiddler fields including text, or null if not found
 */
export async function getTiddlerAtTime(
  repoPath: string,
  tiddlerTitle: string,
  beforeDate: Date,
): Promise<{ fields: Record<string, unknown>; text: string } | null> {
  try {
    // Find commits that modified any file before the specified date
    const beforeISOString = beforeDate.toISOString();

    // First, find all .tid and .meta files that might contain this tiddler
    // We need to search for files because the title might not match the filename
    const logResult = await gitExec(
      ['-c', 'core.quotePath=false', 'log', `--before=${beforeISOString}`, '--name-only', '--pretty=format:%H', '--', '*.tid', '*.meta'],
      repoPath,
    );

    if (logResult.exitCode !== 0) {
      return null;
    }

    const lines = logResult.stdout.trim().split('\n');

    // Parse output: commit hash followed by file names
    let currentCommit: string | null = null;
    const filesToCheck: Array<{ commit: string; file: string }> = [];

    for (const line of lines) {
      if (line.length === 40 && /^[0-9a-f]+$/.test(line)) {
        // This is a commit hash
        currentCommit = line;
      } else if (line.trim().length > 0 && currentCommit) {
        // This is a file name
        const file = line.trim();
        if (file.endsWith('.tid') || file.endsWith('.meta')) {
          filesToCheck.push({ commit: currentCommit, file });
        }
      }
    }

    // Check each file to find the one with matching title
    // Use Promise.all to check files in parallel instead of sequentially
    const searchPromises = filesToCheck.map(async ({ commit, file }) => {
      try {
        const showResult = await gitExec(
          ['show', `${commit}:${file}`],
          repoPath,
        );

        if (showResult.exitCode === 0) {
          const content = showResult.stdout;
          const parsedTiddler = parseTiddlerContent(content);

          if (parsedTiddler.fields.title === tiddlerTitle) {
            return parsedTiddler; // Match found
          }
        }
      } catch {
        // Continue checking other files
      }
      return null; // No match in this file
    });

    // Return the first match found, or null if none match
    const results = await Promise.all(searchPromises);
    return results.find((result): result is { fields: Record<string, unknown>; text: string } => result !== null) ?? null;
  } catch (error) {
    console.error('Error getting tiddler at time:', error);
    return null;
  }
}

/**
 * Parse tiddler content (tid or meta file) into fields and text
 */
function parseTiddlerContent(content: string): { fields: Record<string, unknown>; text: string } {
  const lines = content.split('\n');
  const fields: Record<string, unknown> = {};
  let textStartIndex = 0;

  // Parse headers
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    // Empty line marks end of headers
    if (line.trim() === '') {
      textStartIndex = index + 1;
      break;
    }

    // Parse field: value format
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const fieldName = line.slice(0, colonIndex).trim();
      const fieldValue = line.slice(colonIndex + 1).trim();
      fields[fieldName] = fieldValue;
    }
  }

  // Get text content (everything after the empty line)
  const text = lines.slice(textStartIndex).join('\n');

  return { fields, text };
}

/**
 * Extract title field from tiddler content (tid or meta file)
 * Tiddler files have format:
 * ```
 * title: My Tiddler Title
 * tags: [[Tag1]] [[Tag2]]
 * ...
 *
 * Tiddler text content...
 * ```
 */
function extractTitleFromTiddlerContent(content: string): string | null {
  const lines = content.split('\n');

  for (const line of lines) {
    // Look for "title:" field (case-insensitive)
    const titleMatch = line.match(/^title:\s*(.+)$/i);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Stop at empty line (end of headers)
    if (line.trim() === '') {
      break;
    }
  }

  return null;
}
