// @vitest-environment node

import { exec as gitExec } from 'dugite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureGitIdentity } from '../gitOperations';

describe('ensureGitIdentity', () => {
  let gitEnvironment: NodeJS.ProcessEnv;
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(path.join(os.tmpdir(), 'tidgi-git-identity-'));
    const globalConfigPath = path.join(repoPath, '.empty-global-gitconfig');
    await writeFile(globalConfigPath, '', 'utf8');
    gitEnvironment = {
      ...process.env,
      GIT_CONFIG_GLOBAL: globalConfigPath,
      GIT_CONFIG_NOSYSTEM: '1',
    };
    const initResult = await gitExec(['init', '--initial-branch=main'], repoPath, { env: gitEnvironment });
    expect(initResult.exitCode).toBe(0);
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it('fills missing repository-local identity so rebase can create commits', async () => {
    const git = async (arguments_: string[]) => await gitExec(arguments_, repoPath, { env: gitEnvironment });
    await ensureGitIdentity(repoPath, 'TidGi User', 'tidgi@example.com', gitEnvironment);

    await writeFile(path.join(repoPath, 'initial.txt'), 'initial\n', 'utf8');
    await git(['add', '.']);
    expect((await git(['commit', '-m', 'initial'])).exitCode).toBe(0);

    await git(['checkout', '-b', 'remote']);
    await writeFile(path.join(repoPath, 'remote.txt'), 'remote\n', 'utf8');
    await git(['add', '.']);
    expect((await git(['commit', '-m', 'remote'])).exitCode).toBe(0);

    await git(['checkout', 'main']);
    await writeFile(path.join(repoPath, 'local.txt'), 'local\n', 'utf8');
    await git(['add', '.']);
    expect((await git(['commit', '-m', 'local'])).exitCode).toBe(0);

    expect((await git(['config', '--local', '--get', 'user.name'])).stdout.trim()).toBe('TidGi User');
    expect((await git(['config', '--local', '--get', 'user.email'])).stdout.trim()).toBe('tidgi@example.com');

    const rebaseResult = await git(['rebase', 'remote']);
    expect(rebaseResult.exitCode).toBe(0);
  });

  it('preserves repository identity already configured by the user', async () => {
    await gitExec(['config', '--local', 'user.name', 'Existing User'], repoPath);
    await gitExec(['config', '--local', 'user.email', 'existing@example.com'], repoPath);

    await ensureGitIdentity(repoPath, 'TidGi User', 'tidgi@example.com', gitEnvironment);

    expect((await gitExec(['config', '--local', '--get', 'user.name'], repoPath)).stdout.trim()).toBe('Existing User');
    expect((await gitExec(['config', '--local', '--get', 'user.email'], repoPath)).stdout.trim()).toBe('existing@example.com');
  });

  it('preserves identity inherited from global Git config without persisting local overrides', async () => {
    const globalConfigPath = gitEnvironment.GIT_CONFIG_GLOBAL!;
    await writeFile(globalConfigPath, '[user]\nname = Global User\nemail = global@example.com\n', 'utf8');

    await ensureGitIdentity(repoPath, 'TidGi User', 'tidgi@example.com', gitEnvironment);

    const localName = await gitExec(['config', '--local', '--get', 'user.name'], repoPath, { env: gitEnvironment });
    const localEmail = await gitExec(['config', '--local', '--get', 'user.email'], repoPath, { env: gitEnvironment });
    expect(localName.exitCode).not.toBe(0);
    expect(localEmail.exitCode).not.toBe(0);
    expect((await gitExec(['config', '--get', 'user.name'], repoPath, { env: gitEnvironment })).stdout.trim()).toBe('Global User');
    expect((await gitExec(['config', '--get', 'user.email'], repoPath, { env: gitEnvironment })).stdout.trim()).toBe('global@example.com');
  });
});
