import { spawn as gitSpawn } from 'dugite';
import fs from 'fs-extra';
import path from 'path';

import { logger } from '@services/libs/log';

export const MOBILE_BRANCH = 'mobile-incoming';

export const DESKTOP_GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'TidGi Desktop',
  GIT_AUTHOR_EMAIL: 'desktop@tidgi.fun',
  GIT_COMMITTER_NAME: 'TidGi Desktop',
  GIT_COMMITTER_EMAIL: 'desktop@tidgi.fun',
} as const;

export async function runGit(arguments_: string[], cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<{ exitCode: number | null; stderr: string; stdout: string }> {
  const child = gitSpawn(arguments_, cwd, options);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  return { exitCode, stderr, stdout };
}

export async function runGitCollectStdout(arguments_: string[], cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<string> {
  const { stdout } = await runGit(arguments_, cwd, options);
  return stdout;
}

/**
 * .tid conflict resolution:
 * - Header section (before the first blank line): mobile ("theirs") wins entirely.
 * - Body section (after the first blank line): merge both sides, keeping desktop lines plus unique mobile lines.
 */
export function resolveTidConflictMarkers(content: string): string {
  const lines = content.split('\n');
  const resolved: string[] = [];
  let passedBlankLine = false;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (!line.startsWith('<<<<<<<')) {
      if (!passedBlankLine && line === '') {
        passedBlankLine = true;
      }
      resolved.push(line);
      lineIndex++;
      continue;
    }

    const conflictIsInBody = passedBlankLine;
    const oursLines: string[] = [];
    const theirsLines: string[] = [];
    let conflictSection: 'done' | 'ours' | 'theirs' = 'ours';

    lineIndex++;
    while (lineIndex < lines.length && conflictSection !== 'done') {
      const conflictLine = lines[lineIndex];
      if (conflictLine.startsWith('=======') && conflictSection === 'ours') {
        conflictSection = 'theirs';
      } else if (conflictLine.startsWith('>>>>>>>') && conflictSection === 'theirs') {
        conflictSection = 'done';
      } else if (conflictSection === 'ours') {
        oursLines.push(conflictLine);
      } else {
        theirsLines.push(conflictLine);
      }
      lineIndex++;
    }

    if (conflictIsInBody) {
      resolved.push(...oursLines);
      for (const theirsLine of theirsLines) {
        if (!oursLines.includes(theirsLine)) {
          resolved.push(theirsLine);
        }
      }
    } else {
      // "theirs" = mobile-incoming branch — mobile metadata wins
      resolved.push(...theirsLines);
      if (!passedBlankLine && theirsLines.includes('')) {
        passedBlankLine = true;
      }
    }
  }

  return resolved.join('\n');
}

/**
 * Non-.tid fallback: prefer mobile ("theirs") for all conflict sections.
 */
export function resolveConflictPreferMobile(content: string): string {
  const lines = content.split('\n');
  const resolved: string[] = [];
  let section: 'normal' | 'ours' | 'theirs' = 'normal';
  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      section = 'ours';
    } else if (line.startsWith('=======') && section === 'ours') {
      section = 'theirs';
    } else if (line.startsWith('>>>>>>>') && section === 'theirs') {
      section = 'normal';
    } else if (section !== 'ours') {
      resolved.push(line);
    }
  }
  return resolved.join('\n');
}

/**
 * Resolve all currently-conflicted files (as reported by `git diff --diff-filter=U`).
 * .tid files use TiddlyWiki-aware resolution; all other files prefer mobile.
 * Stages each resolved file and commits to complete the merge.
 */
export async function resolveAllConflicts(repoPath: string): Promise<void> {
  const unmergedOutput = await runGitCollectStdout(['diff', '--name-only', '--diff-filter=U'], repoPath);
  const conflictedFiles = unmergedOutput.trim().split('\n').filter(Boolean);

  for (const file of conflictedFiles) {
    const fullPath = path.join(repoPath, file);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      logger.warn('Could not read conflicted file, skipping', { file });
      continue;
    }

    if (!content.includes('<<<<<<<')) {
      await runGitCollectStdout(['add', file], repoPath);
      continue;
    }

    const resolved = file.endsWith('.tid')
      ? resolveTidConflictMarkers(content)
      : resolveConflictPreferMobile(content);

    await fs.writeFile(fullPath, resolved, 'utf-8');
    await runGitCollectStdout(['add', file], repoPath);
  }

  const { exitCode, stderr } = await runGit(['commit', '--no-edit'], repoPath, {
    env: { ...process.env, ...DESKTOP_GIT_IDENTITY },
  });
  if (exitCode !== 0) {
    logger.warn('Conflict-resolution commit returned non-zero', { repoPath, exitCode, stderr });
  }
}

/**
 * Merge mobile-incoming branch into main and clean up.
 * No-op if the branch does not exist (e.g. direct fast-forward push to main).
 */
export async function mergeMobileIncomingIfExists(repoPath: string): Promise<void> {
  const branchReference = await runGitCollectStdout(['rev-parse', '--verify', `refs/heads/${MOBILE_BRANCH}`], repoPath);
  if (!branchReference.trim()) return;

  logger.info('Merging mobile-incoming branch into main', { repoPath });

  const mergeChild = gitSpawn(
    ['merge', MOBILE_BRANCH, '--no-ff', '-m', 'Merge mobile-incoming (auto-merge by TidGi Desktop)'],
    repoPath,
    { env: { ...process.env, ...DESKTOP_GIT_IDENTITY } },
  );
  let mergeStderr = '';
  mergeChild.stderr.on('data', (data: Buffer) => {
    mergeStderr += data.toString();
  });
  const mergeExitCode = await new Promise<number | null>((resolve, reject) => {
    mergeChild.on('error', reject);
    mergeChild.on('close', resolve);
  });

  if (mergeExitCode !== 0) {
    logger.info('Merge conflicts detected, auto-resolving', { repoPath, mergeStderr });
    await resolveAllConflicts(repoPath);
  }

  const deleteChild = gitSpawn(['branch', '-D', MOBILE_BRANCH], repoPath);
  await new Promise<void>((resolve) => {
    deleteChild.on('error', () => {
      resolve();
    });
    deleteChild.on('close', () => {
      resolve();
    });
  });

  logger.info('Mobile-incoming merge complete', { repoPath });
}
