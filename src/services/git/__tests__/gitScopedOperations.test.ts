import { exec as gitExec } from 'dugite';
import { hasGit } from 'git-sync-js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { commitScopedChanges, getCommitFiles, getGitLog, initScopedWikiGit } from '../gitOperations';

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

  it('getGitLog with scopedPath works on empty repo with uncommitted html changes', async () => {
    const emptyRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-git-empty-'));
    try {
      await initRepo(emptyRepo);
      await fs.writeFile(path.join(emptyRepo, 'wiki.html'), '<html><body>new</body></html>', 'utf-8');
      await fs.writeFile(path.join(emptyRepo, 'notes.txt'), 'other', 'utf-8');

      const scopedLog = await getGitLog(emptyRepo, { scopedPath: 'wiki.html' });
      expect(scopedLog.currentBranch).toBe('');
      expect(scopedLog.entries.some((e) => e.hash === '')).toBe(true);
    } finally {
      await fs.rm(emptyRepo, { recursive: true, force: true });
    }
  });

  it('initScopedWikiGit creates its own repo when parent directory is inside another git repo', async () => {
    const outerRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-git-outer-'));
    try {
      await initRepo(outerRepo);
      await fs.writeFile(path.join(outerRepo, '.gitignore'), 'ignored-dir/\n', 'utf-8');

      const innerDir = path.join(outerRepo, 'ignored-dir', 'wiki-test');
      await fs.mkdir(innerDir, { recursive: true });
      await fs.writeFile(path.join(innerDir, 'wiki.html'), '<html></html>', 'utf-8');

      await initScopedWikiGit(innerDir, 'wiki.html');

      expect(await hasGit(innerDir, true)).toBe(true);
      const show = await gitExec(['show', 'HEAD:wiki.html'], innerDir);
      expect(show.stdout).toContain('<html>');
    } finally {
      await fs.rm(outerRepo, { recursive: true, force: true });
    }
  });

  it('initScopedWikiGit only commits the html file when sibling files and nested wiki exist', async () => {
    const nestedRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-git-init-scoped-'));
    try {
      const innerWiki = path.join(nestedRepo, 'wiki');
      await fs.mkdir(path.join(innerWiki, 'tiddlers'), { recursive: true });
      await initRepo(innerWiki);
      await fs.writeFile(path.join(innerWiki, 'tiddlers', 'Index.tid'), 'title: Index', 'utf-8');
      await gitExec(['add', '.'], innerWiki);
      await gitExec(['commit', '-m', 'inner'], innerWiki);

      await fs.writeFile(path.join(nestedRepo, 'wiki.html'), '<html></html>', 'utf-8');
      await fs.writeFile(path.join(nestedRepo, 'notes.txt'), 'notes', 'utf-8');

      await initScopedWikiGit(nestedRepo, 'wiki.html');

      const status = await gitExec(['status', '--porcelain'], nestedRepo);
      expect(status.stdout).toContain('notes.txt');
      expect(status.stdout).not.toMatch(/^.{1,2}wiki\.html/m);
      expect(status.stdout).not.toContain('160000');
    } finally {
      await fs.rm(nestedRepo, { recursive: true, force: true });
    }
  });

  it('getGitLog with scopedPath does not hang when repo contains nested git directory', async () => {
    const nestedRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-git-nested-'));
    try {
      const innerWiki = path.join(nestedRepo, 'wiki');
      await fs.mkdir(innerWiki, { recursive: true });
      await initRepo(innerWiki);
      await fs.mkdir(path.join(innerWiki, 'tiddlers'), { recursive: true });
      await fs.writeFile(path.join(innerWiki, 'tiddlers', 'Index.tid'), 'title: Index', 'utf-8');
      await gitExec(['add', '.'], innerWiki);
      await gitExec(['commit', '-m', 'inner'], innerWiki);

      await initRepo(nestedRepo);
      await fs.writeFile(path.join(nestedRepo, 'wiki.html'), '<html></html>', 'utf-8');
      await fs.writeFile(path.join(nestedRepo, 'notes.txt'), 'notes', 'utf-8');
      await gitExec(['add', '.'], nestedRepo);
      await gitExec(['commit', '-m', 'outer'], nestedRepo);

      await fs.writeFile(path.join(nestedRepo, 'wiki.html'), '<html>updated</html>', 'utf-8');
      const scopedLog = await getGitLog(nestedRepo, { scopedPath: 'wiki.html' });
      expect(scopedLog.entries.some((e) => e.hash === '')).toBe(true);
    } finally {
      await fs.rm(nestedRepo, { recursive: true, force: true });
    }
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
