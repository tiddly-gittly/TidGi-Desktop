import { ipcMain } from 'electron';
import { injectable, inject } from 'inversify';
import { truncate, debounce } from 'lodash';
import { GitProcess } from 'dugite';
import isDev from 'electron-is-dev';

import * as gitSync from './sync';
import * as github from './github';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';
import { getModifiedFileList, ModifiedFileList, getRemoteUrl } from './inspect';
import { IGitService, IGitUserInfos } from './interface';
import { defaultGitInfo } from './defaultGitInfo';
import { WikiChannel } from '@/constants/channels';

@injectable()
export class Git implements IGitService {
  disableSyncOnDevelopment = true;

  constructor(
    @inject(serviceIdentifier.View) private readonly viewService: IViewService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    this.debounceCommitAndSync = this.commitAndSync.bind(this);
    void this.preferenceService.get('syncDebounceInterval').then((syncDebounceInterval) => {
      this.debounceCommitAndSync = debounce(this.commitAndSync.bind(this), syncDebounceInterval);
    });
  }

  public debounceCommitAndSync: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IGitUserInfos) => Promise<void> | undefined;

  public async getWorkspacesRemote(wikiFolderPath: string): Promise<string> {
    return await getRemoteUrl(wikiFolderPath);
  }

  public async getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]> {
    return await getModifiedFileList(wikiFolderPath);
  }

  /**
   *
   * @param {string} githubRepoName similar to "linonetwo/wiki", string after "https://github.com/"
   */
  public async updateGitInfoTiddler(githubRepoName: string): Promise<void> {
    const browserView = await this.viewService.getActiveBrowserView();
    if (browserView !== undefined) {
      const tiddlerText = await new Promise((resolve) => {
        browserView.webContents.send(WikiChannel.getTiddlerText, '$:/GitHub/Repo');
        ipcMain.once(WikiChannel.getTiddlerTextDone, (_event, value) => resolve(value));
      });
      if (tiddlerText !== githubRepoName) {
        await new Promise<void>((resolve) => {
          browserView.webContents.send(WikiChannel.addTiddler, '$:/GitHub/Repo', githubRepoName, {
            type: 'text/vnd.tiddlywiki',
          });
          ipcMain.once(WikiChannel.addTiddlerDone, () => resolve());
        });
      }
      return;
    }
    logger.error('no browserView in updateGitInfoTiddler');
  }

  public async initWikiGit(
    wikiFolderPath: string,
    isMainWiki: boolean,
    isSyncedWiki?: boolean,
    githubRepoUrl?: string,
    userInfo?: IGitUserInfos,
  ): Promise<void> {
    const logProgress = (message: string): unknown => logger.notice(message, { handler: 'createWikiProgress', function: 'initWikiGit' });
    const logInfo = (message: string): unknown => logger.info(message, { function: 'initWikiGit' });

    logProgress(i18n.t('Log.StartGitInitialization'));
    const { gitUserName, email } = userInfo ?? defaultGitInfo;
    await GitProcess.exec(['init'], wikiFolderPath);
    await gitSync.commitFiles(wikiFolderPath, gitUserName, email);

    // if we are config local wiki, we are done here
    if (isSyncedWiki !== true) {
      logProgress(i18n.t('Log.GitRepositoryConfigurationFinished'));
      return;
    }
    // start config synced wiki
    if (userInfo?.accessToken === undefined) {
      throw new Error(i18n.t('Log.GitTokenMissing') + 'accessToken');
    }
    if (githubRepoUrl === undefined) {
      throw new Error(i18n.t('Log.GitTokenMissing') + 'githubRepoUrl');
    }
    logInfo(
      `Using gitUrl ${githubRepoUrl ?? 'githubRepoUrl unset'} with gitUserName ${gitUserName} and accessToken ${truncate(userInfo?.accessToken, {
        length: 24,
      })}`,
    );
    logProgress(i18n.t('Log.StartConfiguringGithubRemoteRepository'));
    await github.credentialOn(wikiFolderPath, githubRepoUrl, gitUserName, userInfo.accessToken);
    logProgress(i18n.t('Log.StartBackupToGithubRemote'));
    const defaultBranchName = await gitSync.getDefaultBranchName(wikiFolderPath);
    const { stderr: pushStdError, exitCode: pushExitCode } = await GitProcess.exec(
      ['push', 'origin', `${defaultBranchName}:${defaultBranchName}`],
      wikiFolderPath,
    );
    await github.credentialOff(wikiFolderPath);
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
   *
   * @param {string} wikiFolderPath
   * @param {string} githubRepoUrl
   * @param {{ login: string, email: string, accessToken: string }} userInfo
   */
  public async commitAndSync(wikiFolderPath: string, githubRepoUrl: string, userInfo: IGitUserInfos): Promise<void> {
    /** functions to send data to main thread */
    const logProgress = (message: string): unknown =>
      logger.notice(message, { handler: 'wikiSyncProgress', function: 'commitAndSync', wikiFolderPath, githubRepoUrl });
    const logInfo = (message: string): unknown => logger.info(message, { function: 'commitAndSync', wikiFolderPath, githubRepoUrl });

    if (this.disableSyncOnDevelopment && isDev) {
      return;
    }
    const { gitUserName, email, accessToken } = userInfo;
    if (accessToken === '' || accessToken === undefined) {
      throw new Error(i18n.t('Log.GitTokenMissing'));
    }
    const commitMessage = 'Wiki updated with TiddlyGit-Desktop';
    const defaultBranchName = await gitSync.getDefaultBranchName(wikiFolderPath);
    const branchMapping = `${defaultBranchName}:${defaultBranchName}`;
    // update git info tiddler for plugins to use, for example, linonetwo/github-external-image
    let wikiRepoName = new URL(githubRepoUrl).pathname;
    if (wikiRepoName.startsWith('/')) {
      wikiRepoName = wikiRepoName.replace('/', '');
    }
    if (wikiRepoName.length > 0) {
      await this.updateGitInfoTiddler(wikiRepoName);
    }
    // preflight check
    const repoStartingState = await gitSync.getGitRepositoryState(wikiFolderPath, logInfo, logProgress);
    if (repoStartingState.length > 0 || repoStartingState === '|DIRTY') {
      const SYNC_MESSAGE = i18n.t('Log.PrepareSync');
      logProgress(SYNC_MESSAGE);
      logInfo(`${SYNC_MESSAGE} ${wikiFolderPath} , ${gitUserName} <${email}>`);
    } else if (repoStartingState === 'NOGIT') {
      const CANT_SYNC_MESSAGE = i18n.t('Log.CantSyncGitNotInitialized');
      logProgress(CANT_SYNC_MESSAGE);
      throw new Error(CANT_SYNC_MESSAGE);
    } else {
      // we may be in middle of a rebase, try fix that
      await gitSync.continueRebase(wikiFolderPath, gitUserName, email, logInfo, logProgress);
    }
    if (await gitSync.haveLocalChanges(wikiFolderPath)) {
      const SYNC_MESSAGE = i18n.t('Log.HaveThingsToCommit');
      logProgress(SYNC_MESSAGE);
      logInfo(`${SYNC_MESSAGE} ${commitMessage}`);
      const { exitCode: commitExitCode, stderr: commitStdError } = await gitSync.commitFiles(wikiFolderPath, gitUserName, email, commitMessage);
      if (commitExitCode !== 0) {
        logInfo('commit failed');
        logInfo(commitStdError);
      }
      logProgress(i18n.t('Log.CommitComplete'));
    }
    logProgress(i18n.t('Log.PreparingUserInfo'));
    await github.credentialOn(wikiFolderPath, githubRepoUrl, gitUserName, accessToken);
    logProgress(i18n.t('Log.FetchingData'));
    await GitProcess.exec(['fetch', 'origin', defaultBranchName], wikiFolderPath);
    //
    switch (await gitSync.getSyncState(wikiFolderPath, logInfo)) {
      case 'noUpstream': {
        logProgress(i18n.t('Log.CantSyncGitNotInitialized'));
        await github.credentialOff(wikiFolderPath);
        return;
      }
      case 'equal': {
        logProgress(i18n.t('Log.NoNeedToSync'));
        await github.credentialOff(wikiFolderPath);
        return;
      }
      case 'ahead': {
        logProgress(i18n.t('Log.LocalAheadStartUpload'));
        const { exitCode, stderr } = await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
        if (exitCode === 0) {
          break;
        }
        logProgress(i18n.t('Log.GitPushFailed'));
        logInfo(`exitCode: ${exitCode}, stderr of git push:`);
        logInfo(stderr);
        break;
      }
      case 'behind': {
        logProgress(i18n.t('Log.LocalStateBehindSync'));
        const { exitCode, stderr } = await GitProcess.exec(['merge', '--ff', '--ff-only', `origin/${defaultBranchName}`], wikiFolderPath);
        if (exitCode === 0) {
          break;
        }
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
          (await gitSync.getGitRepositoryState(wikiFolderPath, logInfo, logProgress)).length === 0 &&
          (await gitSync.getSyncState(wikiFolderPath, logInfo)) === 'ahead'
        ) {
          logProgress(i18n.t('Log.RebaseSucceed'));
        } else {
          await gitSync.continueRebase(wikiFolderPath, gitUserName, email, logInfo, logProgress);
          logProgress(i18n.t('Log.RebaseConflictNeedsResolve'));
        }
        await GitProcess.exec(['push', 'origin', branchMapping], wikiFolderPath);
        break;
      }
      default: {
        logProgress(i18n.t('Log.SyncFailedSystemError'));
      }
    }
    await github.credentialOff(wikiFolderPath);
    logProgress(i18n.t('Log.PerformLastCheckBeforeSynchronizationFinish'));
    await gitSync.assumeSync(wikiFolderPath, logInfo, logProgress);
    logProgress(i18n.t('Log.SynchronizationFinish'));
  }

  public async clone(githubRepoUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Promise<void> {
    const logProgress = (message: string): unknown => logger.notice(message, { handler: 'createWikiProgress', function: 'clone' });
    const logInfo = (message: string): unknown => logger.info(message, { function: 'clone' });
    logProgress(i18n.t('Log.PrepareCloneOnlineWiki'));
    logProgress(i18n.t('Log.StartGitInitialization'));
    const { gitUserName, accessToken } = userInfo;
    if (accessToken === '' || accessToken === undefined) {
      throw new Error(i18n.t('Log.GitTokenMissing'));
    }
    logInfo(
      i18n.t('Log.UsingUrlAnduserName', {
        githubRepoUrl,
        gitUserName,
        accessToken: truncate(accessToken, {
          length: 24,
        }),
      }),
    );
    await GitProcess.exec(['init'], repoFolderPath);
    logProgress(i18n.t('Log.StartConfiguringGithubRemoteRepository'));
    await github.credentialOn(repoFolderPath, githubRepoUrl, gitUserName, accessToken);
    logProgress(i18n.t('Log.StartFetchingFromGithubRemote'));
    const defaultBranchName = await gitSync.getDefaultBranchName(repoFolderPath);
    const { stderr, exitCode } = await GitProcess.exec(['pull', 'origin', `${defaultBranchName}:${defaultBranchName}`], repoFolderPath);
    await github.credentialOff(repoFolderPath);
    if (exitCode !== 0) {
      logInfo(stderr);
      const CONFIG_FAILED_MESSAGE = i18n.t('Log.GitRepositoryConfigurateFailed');
      logProgress(CONFIG_FAILED_MESSAGE);
      throw new Error(CONFIG_FAILED_MESSAGE);
    } else {
      logProgress(i18n.t('Log.GitRepositoryConfigurationFinished'));
    }
  }
}
