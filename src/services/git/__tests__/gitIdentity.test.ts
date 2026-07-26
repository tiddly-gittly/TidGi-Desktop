// @vitest-environment node

import { exec as gitExec } from 'dugite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureGitIdentity } from '../gitOperations';

describe('ensureGitIdentity', () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(path.join(os.tmpdir(), 'tidgi-git-identity-'));
    const initResult = await gitExec(['init', '--initial-branch=main'], repoPath);
    expect(initResult.exitCode).toBe(0);
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it('fills missing repository-local identity so rebase can create commits', async () => {
    await ensureGitIdentity(repoPath, 'TidGi User', 'tidgi@example.com');

    await writeFile(path.join(repoPath, 'initial.txt'), 'initial\n', 'utf8');
    await gitExec(['add', '.'], repoPath);
    expect((await gitExec(['commit', '-m', 'initial'], repoPath)).exitCode).toBe(0);

    await gitExec(['checkout', '-b', 'remote'], repoPath);
    await writeFile(path.join(repoPath, 'remote.txt'), 'remote\n', 'utf8');
    await gitExec(['add', '.'], repoPath);
    expect((await gitExec(['commit', '-m', 'remote'], repoPath)).exitCode).toBe(0);

    await gitExec(['checkout', 'main'], repoPath);
    await writeFile(path.join(repoPath, 'local.txt'), 'local\n', 'utf8');
    await gitExec(['add', '.'], repoPath);
    expect((await gitExec(['commit', '-m', 'local'], repoPath)).exitCode).toBe(0);

    const rebaseResult = await gitExec(['rebase', 'remote'], repoPath);
    expect(rebaseResult.exitCode).toBe(0);
  });

  it('preserves repository identity already configured by the user', async () => {
    await gitExec(['config', '--local', 'user.name', 'Existing User'], repoPath);
    await gitExec(['config', '--local', 'user.email', 'existing@example.com'], repoPath);

    await ensureGitIdentity(repoPath, 'TidGi User', 'tidgi@example.com');

    expect((await gitExec(['config', '--local', '--get', 'user.name'], repoPath)).stdout.trim()).toBe('Existing User');
    expect((await gitExec(['config', '--local', '--get', 'user.email'], repoPath)).stdout.trim()).toBe('existing@example.com');
  });
});
