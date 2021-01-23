import { ipcMain } from 'electron';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { injectable, inject } from 'inversify';
import { truncate, debounce } from 'lodash';
import { GitProcess } from 'dugite';
import isDev from 'electron-is-dev';

import * as gitSync from './sync';
import * as github from './github';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view';
import type { IPreferenceService } from '@services/preferences';
import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';
import { IUserInfo } from '@services/types';
import { GitChannel } from '@/constants/channels';

/**
 * System Preferences are not stored in storage but stored in macOS Preferences.
 * It can be retrieved and changed using Electron APIs
 */
export interface IGitService {
  debounceCommitAndSync: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo) => Promise<void> | undefined;
  updateGitInfoTiddler(githubRepoName: string): Promise<void>;
  initWikiGit(wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo, isMainWiki: boolean): Promise<void>;
  commitAndSync(wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo): Promise<void>;
  clone(githubRepoUrl: string, repoFolderPath: string, userInfo: IUserInfo): Promise<void>;
}
export const GitServiceIPCDescriptor = {
  channel: GitChannel.name,
  properties: {
    debounceCommitAndSync: ProxyPropertyType.Function,
    updateGitInfoTiddler: ProxyPropertyType.Function,
    initWikiGit: ProxyPropertyType.Function,
    commitAndSync: ProxyPropertyType.Function,
    clone: ProxyPropertyType.Function,
  },
};
@injectable()
export class Git implements IGitService {
  disableSyncOnDevelopment = true;

  constructor(
    @inject(serviceIdentifier.View) private readonly viewService: IViewService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    const syncDebounceInterval = this.preferenceService.get('syncDebounceInterval');
    this.debounceCommitAndSync = debounce(this.commitAndSync.bind(this), syncDebounceInterval);
    this.init();
  }

  public debounceCommitAndSync: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo) => Promise<void> | undefined;

  private init(): void {
    ipcMain.handle('get-workspaces-remote', async (_event, wikiFolderPath) => {
      return await github.getRemoteUrl(wikiFolderPath);
    });
  }

  /**
   *
   * @param {string} githubRepoName similar to "linonetwo/wiki", string after "https://github.com/"
   */
  public async updateGitInfoTiddler(githubRepoName: string): Promise<void> {
    const browserView = this.viewService.getActiveBrowserView();
    if (browserView !== undefined) {
      const tiddlerText = await new Promise((resolve) => {
        browserView.webContents.send('wiki-get-tiddler-text', '$:/GitHub/Repo');
        ipcMain.once('wiki-get-tiddler-text-done', (_event, value) => resolve(value));
      });
      if (tiddlerText !== githubRepoName) {
        await new Promise<void>((resolve) => {
          browserView.webContents.send('wiki-add-tiddler', '$:/GitHub/Repo', githubRepoName, {
            type: 'text/vnd.tiddlywiki',
          });
          ipcMain.once('wiki-add-tiddler-done', () => resolve());
        });
      }
      return;
    }
    logger.error('no browserView in updateGitInfoTiddler');
  }

  /**
   *
   * @param {string} wikiFolderPath
   * @param {string} githubRepoUrl
   * @param {{ login: string, email: string, accessToken: string }} userInfo
   * @param {boolean} isMainWiki
   * @param {{ info: Function, notice: Function }} logger Logger instance from winston
   */
  public async initWikiGit(wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo, isMainWiki: boolean): Promise<void> {
    const logProgress = (message: string): unknown => logger.notice(message, { handler: 'createWikiProgress', function: 'initWikiGit' });
    const logInfo = (message: string): unknown => logger.info(message, { function: 'initWikiGit' });

    logProgress(i18n.t('Log.StartGitInitialization'));
    const { login: username, email, accessToken } = userInfo;
    logInfo(
      `Using gitUrl ${githubRepoUrl} with username ${username} and accessToken ${truncate(accessToken, {
        length: 24,
      })}`,
    );
    await GitProcess.exec(['init'], wikiFolderPath);
    await gitSync.commitFiles(wikiFolderPath, username, email);
    logProgress(i18n.t('Log.StartConfiguringGithubRemoteRepository'));
    await github.credentialOn(wikiFolderPath, githubRepoUrl, userInfo);
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
  public async commitAndSync(wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo): Promise<void> {
    /** functions to send data to main thread */
    const logProgress = (message: string): unknown =>
      logger.notice(message, { handler: 'wikiSyncProgress', function: 'commitAndSync', wikiFolderPath, githubRepoUrl });
    const logInfo = (message: string): unknown => logger.info(message, { function: 'commitAndSync', wikiFolderPath, githubRepoUrl });

    if (this.disableSyncOnDevelopment && isDev) {
      return;
    }
    const { login: username, email } = userInfo;
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
      logInfo(`${SYNC_MESSAGE} ${wikiFolderPath} , ${username} <${email}>`);
    } else if (repoStartingState === 'NOGIT') {
      const CANT_SYNC_MESSAGE = i18n.t('Log.CantSyncGitNotInitialized');
      logProgress(CANT_SYNC_MESSAGE);
      throw new Error(CANT_SYNC_MESSAGE);
    } else {
      // we may be in middle of a rebase, try fix that
      await gitSync.continueRebase(wikiFolderPath, username, email, logInfo, logProgress);
    }
    if (await gitSync.haveLocalChanges(wikiFolderPath)) {
      const SYNC_MESSAGE = i18n.t('Log.HaveThingsToCommit');
      logProgress(SYNC_MESSAGE);
      logInfo(`${SYNC_MESSAGE} ${commitMessage}`);
      const { exitCode: commitExitCode, stderr: commitStdError } = await gitSync.commitFiles(wikiFolderPath, username, email, commitMessage);
      if (commitExitCode !== 0) {
        logInfo('commit failed');
        logInfo(commitStdError);
      }
      logProgress(i18n.t('Log.CommitComplete'));
    }
    logProgress(i18n.t('Log.PreparingUserInfo'));
    await github.credentialOn(wikiFolderPath, githubRepoUrl, userInfo);
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
          await gitSync.continueRebase(wikiFolderPath, username, email, logInfo, logProgress);
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

  public async clone(githubRepoUrl: string, repoFolderPath: string, userInfo: IUserInfo): Promise<void> {
    const logProgress = (message: string): unknown => logger.notice(message, { handler: 'createWikiProgress', function: 'clone' });
    const logInfo = (message: string): unknown => logger.info(message, { function: 'clone' });
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
    await github.credentialOn(repoFolderPath, githubRepoUrl, userInfo);
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
