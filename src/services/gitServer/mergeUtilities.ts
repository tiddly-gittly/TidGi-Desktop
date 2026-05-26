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

export interface TidConflictOptions {
  /**
   * When true and a conflict block starts in the header but contains a blank-line
   * separator in BOTH ours and theirs, the block is split: header keeps theirs,
   * body merges ours lines + unique theirs lines.
   * Default false: entire block prefers theirs (add/add mobile-wins behaviour).
   */
  mergeHeaderBodyConflicts?: boolean;
}

/**
 * Split a list of lines at the first blank line into [headerLines, bodyLines].
 * The blank line itself is excluded from both parts.
 */
function splitAtBlankLine(lines: string[]): { header: string[]; body: string[] } {
  const blankIndex = lines.indexOf('');
  if (blankIndex === -1) {
    return { header: lines, body: [] };
  }
  return {
    header: lines.slice(0, blankIndex),
    body: lines.slice(blankIndex + 1),
  };
}

/**
 * .tid conflict resolution:
 * - Header section (before the first blank line): mobile ("theirs") wins entirely.
 * - Body section (after the first blank line): merge both sides, keeping desktop lines plus unique mobile lines.
 * - When `options.mergeHeaderBodyConflicts` is true and a conflict block starts in
 *   the header but contains a blank line in both ours/theirs, the block is split
 *   at the blank line: header → theirs wins, body → merge ours + unique theirs.
 */
export function resolveTidConflictMarkers(content: string, options: TidConflictOptions = {}): string {
  const { mergeHeaderBodyConflicts = false } = options;
  // Normalize line endings so CRLF (Windows) and lone CR (old Mac) are handled identically to LF.
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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
      // Body conflict: keep ours lines + unique theirs lines (existing behaviour)
      resolved.push(...oursLines);
      for (const theirsLine of theirsLines) {
        if (!oursLines.includes(theirsLine)) {
          resolved.push(theirsLine);
        }
      }
    } else if (mergeHeaderBodyConflicts) {
      // Header-starting conflict: check if it spans into the body
      const { header: _oursHeader, body: oursBody } = splitAtBlankLine(oursLines);
      const { header: theirsHeader, body: theirsBody } = splitAtBlankLine(theirsLines);

      if (oursBody.length > 0 || theirsBody.length > 0) {
        // Conflict spans header + body — keep theirs header, merge bodies
        resolved.push(...theirsHeader);
        resolved.push(''); // blank-line separator
        resolved.push(...oursBody);
        for (const theirsBodyLine of theirsBody) {
          if (!oursBody.includes(theirsBodyLine)) {
            resolved.push(theirsBodyLine);
          }
        }
        passedBlankLine = true;
      } else {
        // Purely header conflict — theirs wins
        resolved.push(...theirsLines);
        if (!passedBlankLine && theirsLines.includes('')) {
          passedBlankLine = true;
        }
      }
    } else {
      // Header-starting conflict without merge option: theirs wins (existing behaviour)
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
  // Normalize line endings so CRLF (Windows) and lone CR (old Mac) are handled identically to LF.
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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

    let resolved: string;
    if (file.endsWith('.tid')) {
      // Detect modify/modify (has common base = stage 1 exists in git ls-files -u).
      // For add/add (no stage 1) we keep the existing mobile-wins behaviour.
      const stageOutput = await runGitCollectStdout(['ls-files', '-u', '--', file], repoPath);
      const hasCommonBase = stageOutput.trim().split('\n').filter(Boolean).some((stageLine) => {
        const tabIndex = stageLine.lastIndexOf('\t');
        if (tabIndex === -1) return false;
        const beforeTab = stageLine.substring(0, tabIndex);
        const lastSpace = beforeTab.lastIndexOf(' ');
        return beforeTab.substring(lastSpace + 1) === '1';
      });
      resolved = resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: hasCommonBase });
    } else {
      resolved = resolveConflictPreferMobile(content);
    }

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
