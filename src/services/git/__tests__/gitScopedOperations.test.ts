import { exec as gitExec } from 'dugite';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { commitScopedChanges, getCommitFiles, getGitLog } from '../gitOperations';

async function initRepo(repoPath: string): Promise<void> {
  await gitExec(['init'], repoPath);
  await gitExec(['config', 'user.email', 'test@example.com'], repoPath);
  await gitExec(['config', 'user.name', 'Test User'], repoPath);
}

describe('git scoped operations for HTML wiki', () => {
  let tempDir: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-git-scoped-'));
    repoPath = tempDir;
    await initRepo(repoPath);
    await fs.writeFile(path.join(repoPath, 'wiki.html'), '<html><body>v1</body></html>', 'utf-8');
    await fs.writeFile(path.join(repoPath, 'notes.txt'), 'other file', 'utf-8');
    await gitExec(['add', 'wiki.html', 'notes.txt'], repoPath);
    await gitExec(['commit', '-m', 'initial'], repoPath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('getCommitFiles with scopedPath only returns the html file for uncommitted changes', async () => {
    await fs.writeFile(path.join(repoPath, 'wiki.html'), '<html><body>v2</body></html>', 'utf-8');
    await fs.writeFile(path.join(repoPath, 'notes.txt'), 'modified other', 'utf-8');

    const scopedFiles = await getCommitFiles(repoPath, '', 'wiki.html');
    const allFiles = await getCommitFiles(repoPath, '');

    expect(scopedFiles.map((f) => f.path)).toEqual(['wiki.html']);
    expect(allFiles.map((f) => f.path).sort()).toEqual(['notes.txt', 'wiki.html']);
  });

  it('getGitLog with scopedPath only reports uncommitted changes for html file', async () => {
    await fs.writeFile(path.join(repoPath, 'notes.txt'), 'only notes changed', 'utf-8');

    const scopedLog = await getGitLog(repoPath, { scopedPath: 'wiki.html' });
    expect(scopedLog.entries.some((e) => e.hash === '')).toBe(false);

    await fs.writeFile(path.join(repoPath, 'wiki.html'), '<html><body>changed</body></html>', 'utf-8');
    const scopedLogWithHtmlChange = await getGitLog(repoPath, { scopedPath: 'wiki.html' });
    expect(scopedLogWithHtmlChange.entries.some((e) => e.hash === '')).toBe(true);
  });

  it('commitScopedChanges only commits the html file', async () => {
    await fs.writeFile(path.join(repoPath, 'wiki.html'), '<html><body>commit me</body></html>', 'utf-8');
    await fs.writeFile(path.join(repoPath, 'notes.txt'), 'do not commit', 'utf-8');

    const committed = await commitScopedChanges(repoPath, 'wiki.html', 'html only');
    expect(committed).toBe(true);

    const status = await gitExec(['status', '--porcelain'], repoPath);
    expect(status.stdout).toContain('notes.txt');
    expect(status.stdout).not.toContain('wiki.html');

    const show = await gitExec(['show', 'HEAD:wiki.html'], repoPath);
    expect(show.stdout).toContain('commit me');
  });
});
