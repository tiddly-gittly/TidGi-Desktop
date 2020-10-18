/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable unicorn/consistent-function-scoping */
/* eslint-disable no-await-in-loop */
const fs = require('fs-extra');
const path = require('path');
const { compact, truncate, trim } = require('lodash');
const { GitProcess } = require('dugite');
const isDev = require('electron-is-dev');
const { ipcMain } = require('electron');
const { logger } = require('../log');
const i18n = require('../i18n');

const disableSyncOnDevelopment = true;

const getGitUrlWithCredential = (rawUrl, username, accessToken) =>
  trim(
    `${rawUrl}.git`.replace(/\n/g, '').replace('https://github.com/', `https://${username}:${accessToken}@github.com/`),
  );
const getGitUrlWithOutCredential = urlWithCredential => trim(urlWithCredential.replace(/.+@/, 'https://'));
/**
 *  Add remote with credential
 * @param {string} wikiFolderPath
 * @param {string} githubRepoUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 */
async function credentialOn(wikiFolderPath, githubRepoUrl, userInfo) {
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
async function credentialOff(wikiFolderPath) {
  const githubRepoUrl = await getRemoteUrl(wikiFolderPath);
  const gitUrlWithOutCredential = getGitUrlWithOutCredential(githubRepoUrl);
  await GitProcess.exec(['remote', 'set-url', 'origin', gitUrlWithOutCredential], wikiFolderPath);
}

/**
 * Get "master" or "main" from git repo
 * @param {string} wikiFolderPath
 */
async function getDefaultBranchName(wikiFolderPath) {
  const { stdout } = await GitProcess.exec(['remote', 'show', 'origin'], wikiFolderPath);
  const lines = stdout.split('\n');
  const lineWithHEAD = lines.find(line => line.includes('HEAD branch: '));
  return lineWithHEAD?.replace('HEAD branch: ', '')?.replace(/\s/g, '');
}

/**
 * Git add and commit all file
 * @param {string} wikiFolderPath
 * @param {string} username
 * @param {string} email
 * @param {?string} message
 */
async function commitFiles(wikiFolderPath, username, email, message = 'Initialize with TiddlyGit-Desktop') {
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
async function initWikiGit(wikiFolderPath, githubRepoUrl, userInfo, isMainWiki) {
  const logProgress = message => logger.notice(message, { handler: 'createWikiProgress', function: 'initWikiGit' });
  const logInfo = message => logger.info(message, { function: 'initWikiGit' });

  logProgress(i18n.t('Log.StartGitInitialization'));
  const { login: username, email, accessToken } = userInfo;
  logInfo(
    `Using gitUrl ${githubRepoUrl} with username ${username} and accessToken ${truncate(accessToken, {
      length: 24,
    })}`,
  );
  await GitProcess.exec(['init'], wikiFolderPath);
  await commitFiles(wikiFolderPath, username, email);
  logProgress(i18n.t('Log.StartConfiguringGithubRemoteRepository'));
  await credentialOn(wikiFolderPath, githubRepoUrl, userInfo);
  logProgress(i18n.t('Log.StartBackupToGithubRemote'));
  const defaultBranchName = await getDefaultBranchName(wikiFolderPath);
  const { stderr: pushStdError, exitCode: pushExitCode } = await GitProcess.exec(
    ['push', 'origin', `${defaultBranchName}:${defaultBranchName}`],
    wikiFolderPath,
  );
  await credentialOff(wikiFolderPath);
  if (isMainWiki && pushExitCode !== 0) {
    logInfo(pushStdError);
    const CONFIG_FAILED_MESSAGE = i18n.t('Log.GitRepositoryConfigurateFailed');
    logProgress(CONFIG_FAILED_MESSAGE);
    throw new Error(CONFIG_FAILED_MESSAGE);
  } else {
    logProgress(i18n.t('Log.GitRepositoryConfigurationFinished'));
  }
}

/**
 * See if there is any file not being committed
 * @param {string} wikiFolderPath repo path to test
 */
async function haveLocalChanges(wikiFolderPath) {
  const { stdout } = await GitProcess.exec(['status', '--porcelain'], wikiFolderPath);
  const matchResult = stdout.match(/^(\?\?|[ACMR] |[ ACMR][DM])*/gm);
  return matchResult.some(match => !!match);
}

/**
 * determine sync state of repository, i.e. how the remote relates to our HEAD
 * 'ahead' means our local state is ahead of remote, 'behind' means local state is behind of the remote
 * @param {string} wikiFolderPath repo path to test
 */
async function getSyncState(wikiFolderPath, logInfo) {
  const defaultBranchName = await getDefaultBranchName(wikiFolderPath);
  const { stdout } = await GitProcess.exec(
    ['rev-list', '--count', '--left-right', `origin/${defaultBranchName}...HEAD`],
    wikiFolderPath,
  );
  logInfo('Checking sync state with upstream');
  logInfo('stdout:', stdout, '(stdout end)');
  if (stdout === '') return 'noUpstream';
  if (stdout.match(/0\t0/)) return 'equal';
  if (stdout.match(/0\t\d+/)) return 'ahead';
  if (stdout.match(/\d+\t0/)) return 'behind';
  return 'diverged';
}

async function assumeSync(wikiFolderPath, logInfo, logProgress) {
  if ((await getSyncState(wikiFolderPath, logInfo)) === 'equal') return;

  const SYNC_ERROR_MESSAGE = i18n.t('Log.SynchronizationFailed');
  logProgress(SYNC_ERROR_MESSAGE);
  throw new Error(SYNC_ERROR_MESSAGE);
}

/**
 * echo the git dir
 * @param {string} wikiFolderPath repo path
 */
async function getGitDirectory(wikiFolderPath, logInfo, logProgress) {
  const { stdout, stderr } = await GitProcess.exec(
    ['rev-parse', '--is-inside-work-tree', wikiFolderPath],
    wikiFolderPath,
  );
  if (stderr) logInfo(stderr);
  if (stdout.startsWith('true')) {
    const { stdout: stdout2 } = await GitProcess.exec(['rev-parse', '--git-dir', wikiFolderPath], wikiFolderPath);
    const [gitPath2, gitPath1] = compact(stdout2.split('\n'));
    if (gitPath1 && gitPath2) {
      return path.resolve(`${gitPath1}/${gitPath2}`);
    }
  }
  const CONFIG_FAILED_MESSAGE = i18n.t('Log.NotAGitRepository');
  logProgress(CONFIG_FAILED_MESSAGE);
  throw new Error(`${wikiFolderPath} ${CONFIG_FAILED_MESSAGE}`);
}

/**
 * get various repo state in string format
 * @param {string} wikiFolderPath repo path to check
 * @returns {string} gitState
 */
async function getGitRepositoryState(wikiFolderPath, logInfo, logProgress) {
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

  if (
    (await GitProcess.exec(['rev-parse', '--is-inside-git-dir', wikiFolderPath], wikiFolderPath)).stdout.startsWith(
      'true',
    )
  ) {
    if (
      (await GitProcess.exec(['rev-parse', '--is-bare-repository', wikiFolderPath], wikiFolderPath)).stdout.startsWith(
        'true',
      )
    ) {
      result += '|BARE';
    } else {
      result += '|GIT_DIR';
    }
  } else if (
    (await GitProcess.exec(['rev-parse', '--is-inside-work-tree', wikiFolderPath], wikiFolderPath)).stdout.startsWith(
      'true',
    )
  ) {
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
async function continueRebase(wikiFolderPath, username, email, logInfo, logProgress) {
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
    hasNotCommittedConflict =
      rebaseContinueStdError.startsWith('CONFLICT') || rebaseContinueStdOut.startsWith('CONFLICT');
  }

  logProgress(i18n.t('Log.CantSyncInSpecialGitStateAutoFixSucceed'));
}

/**
 *
 * @param {string} githubRepoName similar to "linonetwo/wiki", string after "https://github.com/"
 */
async function updateGitInfoTiddler(githubRepoName) {
  // TODO: prevent circle require, use lib like typedi to prevent this
  // eslint-disable-next-line global-require
  const { getActiveBrowserView } = require('../views');
  const browserView = getActiveBrowserView();
  if (browserView && browserView?.webContents?.send) {
    const tiddlerText = await new Promise(resolve => {
      browserView.webContents.send('wiki-get-tiddler-text', '$:/GitHub/Repo');
      ipcMain.once('wiki-get-tiddler-text-done', (_, value) => resolve(value));
    });
    if (tiddlerText !== githubRepoName) {
      return new Promise(resolve => {
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
async function commitAndSync(wikiFolderPath, githubRepoUrl, userInfo) {
  /** functions to send data to main thread */
  const logProgress = message =>
    logger.notice(message, { handler: 'wikiSyncProgress', function: 'commitAndSync', wikiFolderPath, githubRepoUrl });
  const logInfo = message => logger.info(message, { function: 'commitAndSync', wikiFolderPath, githubRepoUrl });
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
    const SYNC_MESSAGE = i18n.t('Log.PrepareSync');
    logProgress(SYNC_MESSAGE);
    logInfo(`${SYNC_MESSAGE} ${wikiFolderPath} , ${username} <${email}>`);
  } else if (repoStartingState === 'NOGIT') {
    const CANT_SYNC_MESSAGE = i18n.t('Log.CantSyncGitNotInitialized');
    logProgress(CANT_SYNC_MESSAGE);
    throw new Error(CANT_SYNC_MESSAGE);
  } else {
    // we may be in middle of a rebase, try fix that
    await continueRebase(wikiFolderPath, username, email, logInfo, logProgress);
  }

  if (await haveLocalChanges(wikiFolderPath)) {
    const SYNC_MESSAGE = i18n.t('Log.HaveThingsToCommit');
    logProgress(SYNC_MESSAGE);
    logInfo(`${SYNC_MESSAGE} ${commitMessage}`);
    const { exitCode: commitExitCode, stderr: commitStdError } = await commitFiles(
      wikiFolderPath,
      username,
      email,
      commitMessage,
    );
    if (commitExitCode !== 0) {
      logInfo('commit failed');
      logInfo(commitStdError);
    }
    logProgress(i18n.t('Log.CommitComplete'));
  }
  logProgress(i18n.t('Log.PreparingUserInfo'));
  await credentialOn(wikiFolderPath, githubRepoUrl, userInfo);
  logProgress(i18n.t('Log.FetchingData'));
  await GitProcess.exec(['fetch', 'origin', defaultBranchName], wikiFolderPath);

  //
  switch (await getSyncState(wikiFolderPath, logInfo)) {
    case 'noUpstream': {
      logProgress(i18n.t('Log.CantSyncGitNotInitialized'));
      await credentialOff(wikiFolderPath);
      return;
    }
    case 'equal': {
      logProgress(i18n.t('Log.NoNeedToSync'));
      await credentialOff(wikiFolderPath);
      return;
    }
    case 'ahead': {
      logProgress(i18n.t('Log.LocalAheadStartUpload'));
      const { exitCode, stderr } = await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
      if (exitCode === 0) break;
      logProgress(i18n.t('Log.GitPushFailed'));
      logInfo(`exitCode: ${exitCode}, stderr of git push:`);
      logInfo(stderr);
      break;
    }
    case 'behind': {
      logProgress(i18n.t('Log.LocalStateBehindSync'));
      const { exitCode, stderr } = await GitProcess.exec(
        ['merge', '--ff', '--ff-only', `origin/${defaultBranchName}`],
        wikiFolderPath,
      );
      if (exitCode === 0) break;
      logProgress(i18n.t('Log.GitMergeFailed'));
      logInfo(`exitCode: ${exitCode}, stderr of git merge:`);
      logInfo(stderr);
      break;
    }
    case 'diverged': {
      logProgress(i18n.t('Log.LocalStateDivergeRebase'));
      const { exitCode } = await GitProcess.exec(['rebase', `origin/${defaultBranchName}`], wikiFolderPath);
      if (
        exitCode === 0 &&
        !(await getGitRepositoryState(wikiFolderPath, logInfo, logProgress)) &&
        (await getSyncState(wikiFolderPath, logInfo)) === 'ahead'
      ) {
        logProgress(i18n.t('Log.RebaseSucceed'));
      } else {
        await continueRebase(wikiFolderPath, username, email, logInfo, logProgress);
        logProgress(i18n.t('Log.RebaseConflictNeedsResolve'));
      }
      await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
      break;
    }
    default: {
      logProgress(i18n.t('Log.SyncFailedSystemError'));
    }
  }

  await credentialOff(wikiFolderPath);
  logProgress(i18n.t('Log.PerformLastCheckBeforeSynchronizationFinish'));
  await assumeSync(wikiFolderPath, logInfo, logProgress);
  logProgress(i18n.t('Log.SynchronizationFinish'));
}

async function getRemoteUrl(wikiFolderPath) {
  const { stdout: remoteStdout } = await GitProcess.exec(['remote'], wikiFolderPath);
  const remotes = compact(remoteStdout.split('\n'));
  const githubRemote = remotes.find(remote => remote === 'origin') || remotes[0] || '';
  if (githubRemote) {
    const { stdout: remoteUrlStdout } = await GitProcess.exec(['remote', 'get-url', githubRemote], wikiFolderPath);
    return remoteUrlStdout.replace('.git', '');
  }
  return '';
}

async function clone(githubRepoUrl, repoFolderPath, userInfo) {
  const logProgress = message => logger.notice(message, { handler: 'createWikiProgress', function: 'clone' });
  const logInfo = message => logger.info(message, { function: 'clone' });
  logProgress(i18n.t('Log.PrepareCloneOnlineWiki'));
  logProgress(i18n.t('Log.StartGitInitialization'));
  const { login: username, accessToken } = userInfo;
  logInfo(
    i18n.t('Log.UsingUrlAndUsername', {
      githubRepoUrl,
      username,
      accessToken: truncate(accessToken, {
        length: 24,
      }),
    }),
  );
  await GitProcess.exec(['init'], repoFolderPath);
  logProgress(i18n.t('Log.StartConfiguringGithubRemoteRepository'));
  await credentialOn(repoFolderPath, githubRepoUrl, userInfo);
  logProgress(i18n.t('Log.StartFetchingFromGithubRemote'));
  const defaultBranchName = await getDefaultBranchName(repoFolderPath);
  const { stderr, exitCode } = await GitProcess.exec(
    ['pull', 'origin', `${defaultBranchName}:${defaultBranchName}`],
    repoFolderPath,
  );
  await credentialOff(repoFolderPath);
  if (exitCode !== 0) {
    logInfo(stderr);
    const CONFIG_FAILED_MESSAGE = i18n.t('Log.GitRepositoryConfigurateFailed');
    logProgress(CONFIG_FAILED_MESSAGE);
    throw new Error(CONFIG_FAILED_MESSAGE);
  } else {
    logProgress(i18n.t('Log.GitRepositoryConfigurationFinished'));
  }
}

module.exports = {
  initWikiGit,
  commitAndSync,
  getRemoteUrl,
  clone,
};
