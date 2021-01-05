/* eslint-disable unicorn/consistent-function-scoping */
/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import path from 'path';
import { compact } from 'lodash';
import { GitProcess, IGitResult } from 'dugite';

import i18n from '@/services/libs/i18n';

/**
 * Get "master" or "main" from git repo
 * @param wikiFolderPath
 */
export async function getDefaultBranchName(wikiFolderPath: string): Promise<string> {
  const { stdout } = await GitProcess.exec(['remote', 'show', 'origin'], wikiFolderPath);
  const lines = stdout.split('\n');
  const lineWithHEAD = lines.find((line) => line.includes('HEAD branch: '));
  const branchName = lineWithHEAD?.replace('HEAD branch: ', '')?.replace(/\s/g, '');
  if (branchName === undefined || branchName.includes('(unknown)')) {
    return 'master';
  }
  return branchName;
}
/**
 * Git add and commit all file
 * @param wikiFolderPath
 * @param username
 * @param email
 * @param message
 */
export async function commitFiles(wikiFolderPath: string, username: string, email: string, message = 'Initialize with TiddlyGit-Desktop'): Promise<IGitResult> {
  await GitProcess.exec(['add', '.'], wikiFolderPath);
  return await GitProcess.exec(['commit', '-m', message, `--author="${username} <${email}>"`], wikiFolderPath);
}

/**
 * See if there is any file not being committed
 * @param {string} wikiFolderPath repo path to test
 */
export async function haveLocalChanges(wikiFolderPath: string): Promise<boolean> {
  const { stdout } = await GitProcess.exec(['status', '--porcelain'], wikiFolderPath);
  const matchResult = stdout.match(/^(\?\?|[ACMR] |[ ACMR][DM])*/gm);
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  return !!matchResult?.some((match) => Boolean(match));
}

export type SyncState = 'noUpstream' | 'equal' | 'ahead' | 'behind' | 'diverged';
/**
 * determine sync state of repository, i.e. how the remote relates to our HEAD
 * 'ahead' means our local state is ahead of remote, 'behind' means local state is behind of the remote
 * @param wikiFolderPath repo path to test
 */
export async function getSyncState(wikiFolderPath: string, logInfo: (message: string) => unknown): Promise<SyncState> {
  const defaultBranchName = await getDefaultBranchName(wikiFolderPath);
  const { stdout } = await GitProcess.exec(['rev-list', '--count', '--left-right', `origin/${defaultBranchName}...HEAD`], wikiFolderPath);
  logInfo('Checking sync state with upstream');
  logInfo(`stdout:\n${stdout}\n(stdout end)`);
  if (stdout === '') {
    return 'noUpstream';
  }
  if (/0\t0/.exec(stdout) !== null) {
    return 'equal';
  }
  if (/0\t\d+/.exec(stdout) !== null) {
    return 'ahead';
  }
  if (/\d+\t0/.exec(stdout) !== null) {
    return 'behind';
  }
  return 'diverged';
}

export async function assumeSync(wikiFolderPath: string, logInfo: (message: string) => unknown, logProgress: (message: string) => unknown): Promise<void> {
  if ((await getSyncState(wikiFolderPath, logInfo)) === 'equal') {
    return;
  }
  const SYNC_ERROR_MESSAGE = i18n.t('Log.SynchronizationFailed');
  logProgress(SYNC_ERROR_MESSAGE);
  throw new Error(SYNC_ERROR_MESSAGE);
}

/**
 * echo the git dir
 * @param wikiFolderPath repo path
 */
async function getGitDirectory(wikiFolderPath: string, logInfo: (message: string) => unknown, logProgress: (message: string) => unknown): Promise<string> {
  const { stdout, stderr } = await GitProcess.exec(['rev-parse', '--is-inside-work-tree', wikiFolderPath], wikiFolderPath);
  if (typeof stderr === 'string' && stderr.length > 0) {
    logInfo(stderr);
  }
  if (stdout.startsWith('true')) {
    const { stdout: stdout2 } = await GitProcess.exec(['rev-parse', '--git-dir', wikiFolderPath], wikiFolderPath);
    const [gitPath2, gitPath1] = compact(stdout2.split('\n'));
    if (gitPath1.length > 0 && gitPath2.length > 0) {
      return path.resolve(`${gitPath1}/${gitPath2}`);
    }
  }
  const CONFIG_FAILED_MESSAGE = i18n.t('Log.NotAGitRepository');
  logProgress(CONFIG_FAILED_MESSAGE);
  throw new Error(`${wikiFolderPath} ${CONFIG_FAILED_MESSAGE}`);
}

/**
 * get various repo state in string format
 * @param wikiFolderPath repo path to check
 * @returns gitState
 * // TODO: use template literal type to get exact type of git state
 */
export async function getGitRepositoryState(
  wikiFolderPath: string,
  logInfo: (message: string) => unknown,
  logProgress: (message: string) => unknown,
): Promise<string> {
  const gitDirectory = await getGitDirectory(wikiFolderPath, logInfo, logProgress);
  if (typeof gitDirectory !== 'string' || gitDirectory.length === 0) {
    return 'NOGIT';
  }
  let result = '';
  if (((await fs.lstat(path.join(gitDirectory, 'rebase-merge', 'interactive')).catch(() => ({}))) as fs.Stats)?.isFile()) {
    result += 'REBASE-i';
  } else if (((await fs.lstat(path.join(gitDirectory, 'rebase-merge')).catch(() => ({}))) as fs.Stats)?.isDirectory()) {
    result += 'REBASE-m';
  } else {
    if (((await fs.lstat(path.join(gitDirectory, 'rebase-apply')).catch(() => ({}))) as fs.Stats)?.isDirectory()) {
      result += 'AM/REBASE';
    }
    if (((await fs.lstat(path.join(gitDirectory, 'MERGE_HEAD')).catch(() => ({}))) as fs.Stats)?.isFile()) {
      result += 'MERGING';
    }
    if (((await fs.lstat(path.join(gitDirectory, 'CHERRY_PICK_HEAD')).catch(() => ({}))) as fs.Stats)?.isFile()) {
      result += 'CHERRY-PICKING';
    }
    if (((await fs.lstat(path.join(gitDirectory, 'BISECT_LOG')).catch(() => ({}))) as fs.Stats)?.isFile()) {
      result += 'BISECTING';
    }
  }
  if ((await GitProcess.exec(['rev-parse', '--is-inside-git-dir', wikiFolderPath], wikiFolderPath)).stdout.startsWith('true')) {
    result += (await GitProcess.exec(['rev-parse', '--is-bare-repository', wikiFolderPath], wikiFolderPath)).stdout.startsWith('true') ? '|BARE' : '|GIT_DIR';
  } else if ((await GitProcess.exec(['rev-parse', '--is-inside-work-tree', wikiFolderPath], wikiFolderPath)).stdout.startsWith('true')) {
    const { exitCode } = await GitProcess.exec(['diff', '--no-ext-diff', '--quiet', '--exit-code'], wikiFolderPath);
    // 1 if there were differences and 0 means no differences.
    if (exitCode !== 0) {
      result += '|DIRTY';
    }
  }
  return result;
}
/**
 * try to continue rebase, simply adding and committing all things, leave them to user to resolve in the TiddlyWiki later.
 * @param wikiFolderPath
 * @param username
 * @param email
 */
export async function continueRebase(
  wikiFolderPath: string,
  username: string,
  email: string,
  logInfo: (message: string) => unknown,
  logProgress: (message: string) => unknown,
): Promise<void> {
  let hasNotCommittedConflict = true;
  let rebaseContinueExitCode = 0;
  let rebaseContinueStdError = '';
  let repositoryState = await getGitRepositoryState(wikiFolderPath, logInfo, logProgress);
  // prevent infin loop, if there is some bug that I miss
  let loopCount = 0;
  while (hasNotCommittedConflict) {
    loopCount += 1;
    if (loopCount > 1000) {
      const CANT_SYNC_MESSAGE = i18n.t('Log.CantSynchronizeAndSyncScriptIsInDeadLoop');
      logProgress(CANT_SYNC_MESSAGE);
      throw new Error(CANT_SYNC_MESSAGE);
    }
    const { exitCode: commitExitCode, stderr: commitStdError } = await commitFiles(
      wikiFolderPath,
      username,
      email,
      'Conflict files committed with TiddlyGit-Desktop',
    );
    const rebaseContinueResult = await GitProcess.exec(['rebase', '--continue'], wikiFolderPath);
    // get info for logging
    rebaseContinueExitCode = rebaseContinueResult.exitCode;
    rebaseContinueStdError = rebaseContinueResult.stderr;
    const rebaseContinueStdOut = rebaseContinueResult.stdout;
    repositoryState = await getGitRepositoryState(wikiFolderPath, logInfo, logProgress);
    // if git add . + git commit failed or git rebase --continue failed
    if (commitExitCode !== 0 || rebaseContinueExitCode !== 0) {
      logInfo(`rebaseContinueStdError when ${repositoryState}`);
      logInfo(rebaseContinueStdError);
      logInfo(`commitStdError when ${repositoryState}`);
      logInfo(commitStdError);
      const CANT_SYNC_MESSAGE = i18n.t('Log.CantSyncInSpecialGitStateAutoFixFailed');
      logProgress(CANT_SYNC_MESSAGE);
      throw new Error(`${repositoryState} ${CANT_SYNC_MESSAGE}`);
    }
    hasNotCommittedConflict = rebaseContinueStdError.startsWith('CONFLICT') || rebaseContinueStdOut.startsWith('CONFLICT');
  }
  logProgress(i18n.t('Log.CantSyncInSpecialGitStateAutoFixSucceed'));
}
