/* eslint-disable no-await-in-loop */
const fs = require('fs-extra');
const path = require('path');
const { compact } = require('lodash');
const { GitProcess } = require('dugite');

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

async function initWikiGit(wikiFolderPath, githubRepoUrl, userInfo) {
  console.log('开始初始化本地Git仓库');
  const { login: username, email, accessToken } = userInfo;
  const gitUrl = `${githubRepoUrl}.git`.replace(
    'https://github.com/',
    `https://${username}:${accessToken}@github.com/`,
  );
  console.info(`Using gitUrl ${gitUrl}`);
  await GitProcess.exec(['init'], wikiFolderPath);
  await commitFiles(wikiFolderPath, username, email);
  console.log('仓库初始化完毕，开始配置Github远端仓库');
  await GitProcess.exec(['remote', 'add', 'origin', gitUrl], wikiFolderPath);
  console.log('正在将Wiki所在的本地Git备份到Github远端仓库');
  const { stderr: pushStdError, exitCode: pushExitCode } = await GitProcess.exec(
    ['push', 'origin', 'master', '--force'],
    wikiFolderPath,
  );
  if (pushExitCode !== 0) {
    console.info('pushStdError', pushStdError);
    throw new Error('Git仓库配置失败，详见错误日志');
  } else {
    console.log('Git仓库配置完毕');
  }
}

/**
 * See if there is any file not being committed
 * @param {string} wikiFolderPath repo path to test
 */
async function haveLocalChanges(wikiFolderPath) {
  const { stdout } = await GitProcess.exec(['status', '--porcelain']);
  const matchResult = stdout.match(/^(\?\?|[ACMR] |[ ACMR][DM])*/gm);
  return matchResult.some(match => !!match);
}

/**
 * determine sync state of repository, i.e. how the remote relates to our HEAD
 * 'ahead' means our local state is ahead of remote, 'behind' means local state is behind of the remote
 * @param {string} wikiFolderPath repo path to test
 */
async function getSyncState(wikiFolderPath) {
  const { stdout } = await GitProcess.exec(
    ['rev-list', '--count', '--left-right', 'origin/master...HEAD'],
    wikiFolderPath,
  );
  console.info('Checking sync state with upstream');
  console.info('stdout:', stdout, '(stdout end)');
  if (stdout === '') return 'noUpstream';
  if (stdout.match(/0\t0/)) return 'equal';
  if (stdout.match(/0\t\d+/)) return 'ahead';
  if (stdout.match(/\d+\t0/)) return 'behind';
  return 'diverged';
}

async function assumeSync(wikiFolderPath) {
  if ((await getSyncState(wikiFolderPath)) === 'equal') return;
  throw new Error(
    '同步失败！你需要用 Github Desktop 等工具检查当前 Git 仓库的状态。失败可能是网络原因导致的，如果的确如此，可在调整网络后重试。',
  );
}

/**
 * echo the git dir
 * @param {string} wikiFolderPath repo path
 */
async function getGitDirectory(wikiFolderPath) {
  const { stdout, stderr } = await GitProcess.exec(
    ['rev-parse', '--is-inside-work-tree', wikiFolderPath],
    wikiFolderPath,
  );
  if (stderr) console.info(stderr);
  if (stdout.startsWith('true')) {
    const { stdout: stdout2 } = await GitProcess.exec(['rev-parse', '--git-dir', wikiFolderPath], wikiFolderPath);
    const [gitPath2, gitPath1] = compact(stdout2.split('\n'));
    if (gitPath1 && gitPath2) {
      return path.resolve(`${gitPath1}/${gitPath2}`);
    }
  }
  throw new Error(`${wikiFolderPath} 不是一个 git 仓库`);
}

/**
 * get various repo state in string format
 * @param {string} wikiFolderPath repo path to check
 * @returns {string} gitState
 */
async function getGitRepositoryState(wikiFolderPath) {
  const gitDirectory = await getGitDirectory(wikiFolderPath);
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
    if (exitCode === 0) {
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
async function continueRebase(wikiFolderPath, username, email) {
  let hasNotCommittedConflict = true;
  let rebaseContinueExitCode = 0;
  let rebaseContinueStdError = '';
  let repositoryState = await getGitRepositoryState(wikiFolderPath);
  // prevent infin loop, if there is some bug that I miss
  let loopCount = 0;
  while (hasNotCommittedConflict) {
    loopCount += 1;
    if (loopCount > 1000) {
      throw new Error('无法同步，而且同步脚本陷入死循环');
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
    repositoryState = await getGitRepositoryState(wikiFolderPath);
    // if git add . + git commit failed or git rebase --continue failed
    if (commitExitCode !== 0 || rebaseContinueExitCode !== 0) {
      console.info(`rebaseContinueStdError when ${repositoryState}`);
      console.info(rebaseContinueStdError);
      console.info(`commitStdError when ${repositoryState}`);
      console.info(commitStdError);
      throw new Error(
        `无法同步，这个文件夹处在 ${repositoryState} 状态，不能直接进行同步，已尝试自动修复，但还是出现错误，请先解决所有冲突（例如使用 VSCode 打开)，如果还不行，请用 Git 工具解决问题`,
      );
    }
    hasNotCommittedConflict =
      rebaseContinueStdError.startsWith('CONFLICT') || rebaseContinueStdOut.startsWith('CONFLICT');
  }

  console.log(`这个文件夹处在 ${repositoryState} 状态，不能直接进行同步，但已自动修复`);
}

async function commitAndSync(wikiFolderPath, githubRepoUrl, userInfo) {
  const { login: username, email } = userInfo;
  const commitMessage = 'Wiki updated with TiddlyGit-Desktop';
  const branchMapping = 'master:master';

  // preflight check
  const repoStartingState = await getGitRepositoryState(wikiFolderPath);
  if (!repoStartingState || repoStartingState === '|DIRTY') {
    console.log(`准备同步 ${wikiFolderPath} ，使用的作者信息为 ${username} <${email}>`);
  } else if (repoStartingState === 'NOGIT') {
    throw new Error(`无法同步，这个文件夹没有初始化为 Git 仓库`);
  } else {
    // we may be in middle of a rebase, try fix that
    await continueRebase(wikiFolderPath, username, email);
  }

  if (await haveLocalChanges(wikiFolderPath)) {
    console.log(`有需要提交(commit)的内容，正在自动提交，使用的提交信息为 「${commitMessage}」`);
    const { exitCode: commitExitCode, stderr: commitStdError } = await commitFiles(
      wikiFolderPath,
      username,
      email,
      commitMessage,
    );
    if (commitExitCode !== 0) {
      console.info('commit failed');
      console.info(commitStdError);
    }
  }
  console.log('正在拉取云端数据，以便比对');
  await GitProcess.exec(['fetch', 'origin', 'master'], wikiFolderPath);

  //
  switch (await getSyncState(wikiFolderPath)) {
    case 'noUpstream': {
      console.log('同步失败，当前目录可能不是一个初始化好的 git 仓库');
      return;
    }
    case 'equal': {
      console.log('无需同步，本地状态和云端一致');
      return;
    }
    case 'ahead': {
      console.log('本地状态超前于云端，开始上传');
      const { exitCode, stderr } = await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
      if (exitCode === 0) break;
      console.log(`git push 的返回值是 ${exitCode}，这通常意味着有网络问题`);
      console.info('stderr of git push:');
      console.info(stderr);
      break;
    }
    case 'behind': {
      console.log('本地状态落后于云端，开始合并云端数据');
      const { exitCode, stderr } = await GitProcess.exec(
        ['merge', '--ff', '--ff-only', 'origin/master'],
        wikiFolderPath,
      );
      if (exitCode === 0) break;
      console.log(`git merge 的返回值是 ${exitCode}，详见错误日志`);
      console.info('stderr of git merge:');
      console.info(stderr);
      break;
    }
    case 'diverged': {
      console.log('本地状态与云端有分歧，开始变基(Rebase)');
      const { exitCode, stderr } = await GitProcess.exec(['rebase', 'origin/master'], wikiFolderPath);
      if (
        exitCode === 0 &&
        !(await getGitRepositoryState(wikiFolderPath)) &&
        (await getSyncState(wikiFolderPath)) === 'ahead'
      ) {
        console.log('变基(Rebase)成功，开始上传');
      } else {
        await continueRebase(wikiFolderPath, username, email);
        console.log(`变基(Rebase)时发现冲突，需要解决冲突`);
      }
      await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
      await assumeSync(wikiFolderPath);
      break;
    }
    default: {
      console.log('同步失败，同步系统可能出现问题');
    }
  }

  console.log('进行同步结束前最后的检查');
  await assumeSync(wikiFolderPath);
  console.log(`${wikiFolderPath} 同步完成`);
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

module.exports = {
  initWikiGit,
  commitAndSync,
  getRemoteUrl,
};
