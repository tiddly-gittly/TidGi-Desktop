/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable unicorn/consistent-function-scoping */
/* eslint-disable no-await-in-loop */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'fs'.
const fs = require('fs-extra');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'compact'.
const { compact, truncate, trim } = require('lodash');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'GitProcess... Remove this comment to see the full error message
const { GitProcess } = require('dugite');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'isDev'.
const isDev = require('electron-is-dev');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'ipcMain'.
const { ipcMain } = require('electron');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'logger'.
const { logger } = require('../log');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'index18n'.
const index18n = require('../i18n');

const disableSyncOnDevelopment = true;

const getGitUrlWithCredential = (rawUrl: any, username: any, accessToken: any) =>
  trim(`${rawUrl}.git`.replace(/\n/g, '').replace('https://github.com/', `https://${username}:${accessToken}@github.com/`));
const getGitUrlWithOutCredential = (urlWithCredential: any) => trim(urlWithCredential.replace(/.+@/, 'https://'));
/**
 *  Add remote with credential
 * @param {string} wikiFolderPath
 * @param {string} githubRepoUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 */
async function credentialOn(wikiFolderPath: any, githubRepoUrl: any, userInfo: any) {
  const { login: username, accessToken } = userInfo;
  const gitUrlWithCredential = getGitUrlWithCredential(githubRepoUrl, username, accessToken);
  await GitProcess.exec(['remote', 'add', 'origin', gitUrlWithCredential], wikiFolderPath);
  await GitProcess.exec(['remote', 'set-url', 'origin', gitUrlWithCredential], wikiFolderPath);
}
/**
 *  Add remote without credential
 * @param {string} wikiFolderPath
 * @param {string} githubRepoUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 */
async function credentialOff(wikiFolderPath: any) {
  const githubRepoUrl = await getRemoteUrl(wikiFolderPath);
  const gitUrlWithOutCredential = getGitUrlWithOutCredential(githubRepoUrl);
  await GitProcess.exec(['remote', 'set-url', 'origin', gitUrlWithOutCredential], wikiFolderPath);
}

/**
 * Get "master" or "main" from git repo
 * @param {string} wikiFolderPath
 */
async function getDefaultBranchName(wikiFolderPath: any) {
  const { stdout } = await GitProcess.exec(['remote', 'show', 'origin'], wikiFolderPath);
  const lines = stdout.split('\n');
  const lineWithHEAD = lines.find((line: any) => line.includes('HEAD branch: '));
  const branchName = lineWithHEAD?.replace('HEAD branch: ', '')?.replace(/\s/g, '');
  if (!branchName || branchName.includes('(unknown)')) {
    return 'master';
  }
  return branchName;
}

/**
 * Git add and commit all file
 * @param {string} wikiFolderPath
 * @param {string} username
 * @param {string} email
 * @param {?string} message
 */
async function commitFiles(wikiFolderPath: any, username: any, email: any, message = 'Initialize with TiddlyGit-Desktop') {
  await GitProcess.exec(['add', '.'], wikiFolderPath);
  return GitProcess.exec(['commit', '-m', message, `--author="${username} <${email}>"`], wikiFolderPath);
}

/**
 *
 * @param {string} wikiFolderPath
 * @param {string} githubRepoUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 * @param {boolean} isMainWiki
 * @param {{ info: Function, notice: Function }} logger Logger instance from winston
 */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'initWikiGi... Remove this comment to see the full error message
async function initWikiGit(wikiFolderPath: any, githubRepoUrl: any, userInfo: any, isMainWiki: any) {
  const logProgress = (message: any) => logger.notice(message, { handler: 'createWikiProgress', function: 'initWikiGit' });
  const logInfo = (message: any) => logger.info(message, { function: 'initWikiGit' });

  logProgress(index18n.t('Log.StartGitInitialization'));
  const { login: username, email, accessToken } = userInfo;
  logInfo(
    `Using gitUrl ${githubRepoUrl} with username ${username} and accessToken ${truncate(accessToken, {
      length: 24,
    })}`,
  );
  await GitProcess.exec(['init'], wikiFolderPath);
  await commitFiles(wikiFolderPath, username, email);
  logProgress(index18n.t('Log.StartConfiguringGithubRemoteRepository'));
  await credentialOn(wikiFolderPath, githubRepoUrl, userInfo);
  logProgress(index18n.t('Log.StartBackupToGithubRemote'));
  const defaultBranchName = await getDefaultBranchName(wikiFolderPath);
  const { stderr: pushStdError, exitCode: pushExitCode } = await GitProcess.exec(
    ['push', 'origin', `${defaultBranchName}:${defaultBranchName}`],
    wikiFolderPath,
  );
  await credentialOff(wikiFolderPath);
  if (isMainWiki && pushExitCode !== 0) {
    logInfo(pushStdError);
    const CONFIG_FAILED_MESSAGE = index18n.t('Log.GitRepositoryConfigurateFailed');
    logProgress(CONFIG_FAILED_MESSAGE);
    throw new Error(CONFIG_FAILED_MESSAGE);
  } else {
    logProgress(index18n.t('Log.GitRepositoryConfigurationFinished'));
  }
}

/**
 * See if there is any file not being committed
 * @param {string} wikiFolderPath repo path to test
 */
async function haveLocalChanges(wikiFolderPath: any) {
  const { stdout } = await GitProcess.exec(['status', '--porcelain'], wikiFolderPath);
  const matchResult = stdout.match(/^(\?\?|[ACMR] |[ ACMR][DM])*/gm);
  return matchResult.some((match: any) => !!match);
}

/**
 * determine sync state of repository, i.e. how the remote relates to our HEAD
 * 'ahead' means our local state is ahead of remote, 'behind' means local state is behind of the remote
 * @param {string} wikiFolderPath repo path to test
 */
async function getSyncState(wikiFolderPath: any, logInfo: any) {
  const defaultBranchName = await getDefaultBranchName(wikiFolderPath);
  const { stdout } = await GitProcess.exec(['rev-list', '--count', '--left-right', `origin/${defaultBranchName}...HEAD`], wikiFolderPath);
  logInfo('Checking sync state with upstream');
  logInfo('stdout:', stdout, '(stdout end)');
  if (stdout === '') return 'noUpstream';
  if (stdout.match(/0\t0/)) return 'equal';
  if (stdout.match(/0\t\d+/)) return 'ahead';
  if (stdout.match(/\d+\t0/)) return 'behind';
  return 'diverged';
}

async function assumeSync(wikiFolderPath: any, logInfo: any, logProgress: any) {
  if ((await getSyncState(wikiFolderPath, logInfo)) === 'equal') return;

  const SYNC_ERROR_MESSAGE = index18n.t('Log.SynchronizationFailed');
  logProgress(SYNC_ERROR_MESSAGE);
  throw new Error(SYNC_ERROR_MESSAGE);
}

/**
 * echo the git dir
 * @param {string} wikiFolderPath repo path
 */
async function getGitDirectory(wikiFolderPath: any, logInfo: any, logProgress: any) {
  const { stdout, stderr } = await GitProcess.exec(['rev-parse', '--is-inside-work-tree', wikiFolderPath], wikiFolderPath);
  if (stderr) logInfo(stderr);
  if (stdout.startsWith('true')) {
    const { stdout: stdout2 } = await GitProcess.exec(['rev-parse', '--git-dir', wikiFolderPath], wikiFolderPath);
    const [gitPath2, gitPath1] = compact(stdout2.split('\n'));
    if (gitPath1 && gitPath2) {
      return path.resolve(`${gitPath1}/${gitPath2}`);
    }
  }
  const CONFIG_FAILED_MESSAGE = index18n.t('Log.NotAGitRepository');
  logProgress(CONFIG_FAILED_MESSAGE);
  throw new Error(`${wikiFolderPath} ${CONFIG_FAILED_MESSAGE}`);
}

/**
 * get various repo state in string format
 * @param {string} wikiFolderPath repo path to check
 * @returns {string} gitState
 */
async function getGitRepositoryState(wikiFolderPath: any, logInfo: any, logProgress: any) {
  const gitDirectory = await getGitDirectory(wikiFolderPath, logInfo, logProgress);
  if (!gitDirectory) return 'NOGIT';
  let result = '';
  if ((await fs.lstat(path.join(gitDirectory, 'rebase-merge', 'interactive')).catch(() => {}))?.isFile()) {
    result += 'REBASE-i';
  } else if ((await fs.lstat(path.join(gitDirectory, 'rebase-merge')).catch(() => {}))?.isDirectory()) {
    result += 'REBASE-m';
  } else {
    if ((await fs.lstat(path.join(gitDirectory, 'rebase-apply')).catch(() => {}))?.isDirectory()) {
      result += 'AM/REBASE';
    }
    if ((await fs.lstat(path.join(gitDirectory, 'MERGE_HEAD')).catch(() => {}))?.isFile()) {
      result += 'MERGING';
    }
    if ((await fs.lstat(path.join(gitDirectory, 'CHERRY_PICK_HEAD')).catch(() => {}))?.isFile()) {
      result += 'CHERRY-PICKING';
    }
    if ((await fs.lstat(path.join(gitDirectory, 'BISECT_LOG')).catch(() => {}))?.isFile()) {
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
 * @param {*} wikiFolderPath
 * @param {string} username
 * @param {string} email
 */
async function continueRebase(wikiFolderPath: any, username: any, email: any, logInfo: any, logProgress: any) {
  let hasNotCommittedConflict = true;
  let rebaseContinueExitCode = 0;
  let rebaseContinueStdError = '';
  let repositoryState = await getGitRepositoryState(wikiFolderPath, logInfo, logProgress);
  // prevent infin loop, if there is some bug that I miss
  let loopCount = 0;
  while (hasNotCommittedConflict) {
    loopCount += 1;
    if (loopCount > 1000) {
      const CANT_SYNC_MESSAGE = index18n.t('Log.CantSynchronizeAndSyncScriptIsInDeadLoop');
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
      const CANT_SYNC_MESSAGE = index18n.t('Log.CantSyncInSpecialGitStateAutoFixFailed');
      logProgress(CANT_SYNC_MESSAGE);
      throw new Error(`${repositoryState} ${CANT_SYNC_MESSAGE}`);
    }
    hasNotCommittedConflict = rebaseContinueStdError.startsWith('CONFLICT') || rebaseContinueStdOut.startsWith('CONFLICT');
  }

  logProgress(index18n.t('Log.CantSyncInSpecialGitStateAutoFixSucceed'));
}

/**
 *
 * @param {string} githubRepoName similar to "linonetwo/wiki", string after "https://github.com/"
 */
async function updateGitInfoTiddler(githubRepoName: any) {
  // TODO: prevent circle require, use lib like typedi to prevent this
  // eslint-disable-next-line global-require
  const { getActiveBrowserView } = require('../views');
  const browserView = getActiveBrowserView();
  if (browserView && browserView?.webContents?.send) {
    const tiddlerText = await new Promise((resolve) => {
      browserView.webContents.send('wiki-get-tiddler-text', '$:/GitHub/Repo');
      ipcMain.once('wiki-get-tiddler-text-done', (_, value) => resolve(value));
    });
    if (tiddlerText !== githubRepoName) {
      return new Promise((resolve) => {
        browserView.webContents.send('wiki-add-tiddler', '$:/GitHub/Repo', githubRepoName, {
          type: 'text/vnd.tiddlywiki',
        });
        ipcMain.once('wiki-add-tiddler-done', resolve);
      });
    }
    return Promise.resolve();
  }
  return logger.error('no browserView in updateGitInfoTiddler');
}

/**
 *
 * @param {string} wikiFolderPath
 * @param {string} githubRepoUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'commitAndS... Remove this comment to see the full error message
async function commitAndSync(wikiFolderPath: any, githubRepoUrl: any, userInfo: any) {
  /** functions to send data to main thread */
  const logProgress = (message: any) => logger.notice(message, { handler: 'wikiSyncProgress', function: 'commitAndSync', wikiFolderPath, githubRepoUrl });
  const logInfo = (message: any) => logger.info(message, { function: 'commitAndSync', wikiFolderPath, githubRepoUrl });
  if (disableSyncOnDevelopment && isDev) return;

  const { login: username, email } = userInfo;
  const commitMessage = 'Wiki updated with TiddlyGit-Desktop';
  const defaultBranchName = await getDefaultBranchName(wikiFolderPath);
  const branchMapping = `${defaultBranchName}:${defaultBranchName}`;

  // update git info tiddler for plugins to use, for example, linonetwo/github-external-image
  let wikiRepoName = new URL(githubRepoUrl).pathname;
  if (wikiRepoName.startsWith('/')) {
    wikiRepoName = wikiRepoName.replace('/', '');
  }
  if (wikiRepoName) {
    await updateGitInfoTiddler(wikiRepoName);
  }

  // preflight check
  const repoStartingState = await getGitRepositoryState(wikiFolderPath, logInfo, logProgress);
  if (!repoStartingState || repoStartingState === '|DIRTY') {
    const SYNC_MESSAGE = index18n.t('Log.PrepareSync');
    logProgress(SYNC_MESSAGE);
    logInfo(`${SYNC_MESSAGE} ${wikiFolderPath} , ${username} <${email}>`);
  } else if (repoStartingState === 'NOGIT') {
    const CANT_SYNC_MESSAGE = index18n.t('Log.CantSyncGitNotInitialized');
    logProgress(CANT_SYNC_MESSAGE);
    throw new Error(CANT_SYNC_MESSAGE);
  } else {
    // we may be in middle of a rebase, try fix that
    await continueRebase(wikiFolderPath, username, email, logInfo, logProgress);
  }

  if (await haveLocalChanges(wikiFolderPath)) {
    const SYNC_MESSAGE = index18n.t('Log.HaveThingsToCommit');
    logProgress(SYNC_MESSAGE);
    logInfo(`${SYNC_MESSAGE} ${commitMessage}`);
    const { exitCode: commitExitCode, stderr: commitStdError } = await commitFiles(wikiFolderPath, username, email, commitMessage);
    if (commitExitCode !== 0) {
      logInfo('commit failed');
      logInfo(commitStdError);
    }
    logProgress(index18n.t('Log.CommitComplete'));
  }
  logProgress(index18n.t('Log.PreparingUserInfo'));
  await credentialOn(wikiFolderPath, githubRepoUrl, userInfo);
  logProgress(index18n.t('Log.FetchingData'));
  await GitProcess.exec(['fetch', 'origin', defaultBranchName], wikiFolderPath);

  //
  switch (await getSyncState(wikiFolderPath, logInfo)) {
    case 'noUpstream': {
      logProgress(index18n.t('Log.CantSyncGitNotInitialized'));
      await credentialOff(wikiFolderPath);
      return;
    }
    case 'equal': {
      logProgress(index18n.t('Log.NoNeedToSync'));
      await credentialOff(wikiFolderPath);
      return;
    }
    case 'ahead': {
      logProgress(index18n.t('Log.LocalAheadStartUpload'));
      const { exitCode, stderr } = await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
      if (exitCode === 0) break;
      logProgress(index18n.t('Log.GitPushFailed'));
      logInfo(`exitCode: ${exitCode}, stderr of git push:`);
      logInfo(stderr);
      break;
    }
    case 'behind': {
      logProgress(index18n.t('Log.LocalStateBehindSync'));
      const { exitCode, stderr } = await GitProcess.exec(['merge', '--ff', '--ff-only', `origin/${defaultBranchName}`], wikiFolderPath);
      if (exitCode === 0) break;
      logProgress(index18n.t('Log.GitMergeFailed'));
      logInfo(`exitCode: ${exitCode}, stderr of git merge:`);
      logInfo(stderr);
      break;
    }
    case 'diverged': {
      logProgress(index18n.t('Log.LocalStateDivergeRebase'));
      const { exitCode } = await GitProcess.exec(['rebase', `origin/${defaultBranchName}`], wikiFolderPath);
      if (exitCode === 0 && !(await getGitRepositoryState(wikiFolderPath, logInfo, logProgress)) && (await getSyncState(wikiFolderPath, logInfo)) === 'ahead') {
        logProgress(index18n.t('Log.RebaseSucceed'));
      } else {
        await continueRebase(wikiFolderPath, username, email, logInfo, logProgress);
        logProgress(index18n.t('Log.RebaseConflictNeedsResolve'));
      }
      await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
      break;
    }
    default: {
      logProgress(index18n.t('Log.SyncFailedSystemError'));
    }
  }

  await credentialOff(wikiFolderPath);
  logProgress(index18n.t('Log.PerformLastCheckBeforeSynchronizationFinish'));
  await assumeSync(wikiFolderPath, logInfo, logProgress);
  logProgress(index18n.t('Log.SynchronizationFinish'));
}

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getRemoteU... Remove this comment to see the full error message
async function getRemoteUrl(wikiFolderPath: any) {
  const { stdout: remoteStdout } = await GitProcess.exec(['remote'], wikiFolderPath);
  const remotes = compact(remoteStdout.split('\n'));
  const githubRemote = remotes.find((remote: any) => remote === 'origin') || remotes[0] || '';
  if (githubRemote) {
    const { stdout: remoteUrlStdout } = await GitProcess.exec(['remote', 'get-url', githubRemote], wikiFolderPath);
    return remoteUrlStdout.replace('.git', '');
  }
  return '';
}

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'clone'.
async function clone(githubRepoUrl: any, repoFolderPath: any, userInfo: any) {
  const logProgress = (message: any) => logger.notice(message, { handler: 'createWikiProgress', function: 'clone' });
  const logInfo = (message: any) => logger.info(message, { function: 'clone' });
  logProgress(index18n.t('Log.PrepareCloneOnlineWiki'));
  logProgress(index18n.t('Log.StartGitInitialization'));
  const { login: username, accessToken } = userInfo;
  logInfo(
    index18n.t('Log.UsingUrlAndUsername', {
      githubRepoUrl,
      username,
      accessToken: truncate(accessToken, {
        length: 24,
      }),
    }),
  );
  await GitProcess.exec(['init'], repoFolderPath);
  logProgress(index18n.t('Log.StartConfiguringGithubRemoteRepository'));
  await credentialOn(repoFolderPath, githubRepoUrl, userInfo);
  logProgress(index18n.t('Log.StartFetchingFromGithubRemote'));
  const defaultBranchName = await getDefaultBranchName(repoFolderPath);
  const { stderr, exitCode } = await GitProcess.exec(['pull', 'origin', `${defaultBranchName}:${defaultBranchName}`], repoFolderPath);
  await credentialOff(repoFolderPath);
  if (exitCode !== 0) {
    logInfo(stderr);
    const CONFIG_FAILED_MESSAGE = index18n.t('Log.GitRepositoryConfigurateFailed');
    logProgress(CONFIG_FAILED_MESSAGE);
    throw new Error(CONFIG_FAILED_MESSAGE);
  } else {
    logProgress(index18n.t('Log.GitRepositoryConfigurationFinished'));
  }
}

module.exports = {
  initWikiGit,
  commitAndSync,
  getRemoteUrl,
  clone,
};
