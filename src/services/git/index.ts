import { ipcMain } from 'electron';
import { injectable, inject } from 'inversify';
import { debounce } from 'lodash';
import {
  AssumeSyncError,
  CantSyncGitNotInitializedError,
  CantSyncInSpecialGitStateAutoFixFailed,
  clone,
  commitAndSync,
  getModifiedFileList,
  getRemoteUrl,
  GitPullPushError,
  GitStep,
  ILoggerContext,
  initGit,
  ModifiedFileList,
  SyncParameterMissingError,
  SyncScriptIsInDeadLoopError,
} from 'git-sync-js';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';
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

  public debounceCommitAndSync: (wikiFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos) => Promise<void> | undefined;

  public async getWorkspacesRemote(wikiFolderPath: string): Promise<string> {
    return await getRemoteUrl(wikiFolderPath);
  }

  public async getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]> {
    return await getModifiedFileList(wikiFolderPath);
  }

  /**
   *
   * @param {string} githubRepoName similar to "linonetwo/wiki", string after "https://com/"
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

  private translateMessage(message: string): string {
    switch (message) {
      case GitStep.StartGitInitialization: {
        return i18n.t('Log.StartGitInitialization');
      }
      case GitStep.GitRepositoryConfigurationFinished: {
        return i18n.t('Log.GitRepositoryConfigurationFinished');
      }
      case GitStep.StartConfiguringGithubRemoteRepository: {
        return i18n.t('Log.StartConfiguringGithubRemoteRepository');
      }
      case GitStep.StartBackupToGitRemote: {
        return i18n.t('Log.StartBackupToGithubRemote');
      }
      case GitStep.PrepareCloneOnlineWiki: {
        return i18n.t('Log.PrepareCloneOnlineWiki');
      }
      case GitStep.PrepareSync: {
        return i18n.t('Log.PrepareSync');
      }
      case GitStep.HaveThingsToCommit: {
        return i18n.t('Log.HaveThingsToCommit');
      }
      case GitStep.AddingFiles: {
        return i18n.t('Log.AddingFiles');
      }
      case GitStep.AddComplete: {
        return i18n.t('Log.AddComplete');
      }
      case GitStep.CommitComplete: {
        return i18n.t('Log.CommitComplete');
      }
      case GitStep.PreparingUserInfo: {
        return i18n.t('Log.PreparingUserInfo');
      }
      case GitStep.FetchingData: {
        return i18n.t('Log.FetchingData');
      }
      case GitStep.NoNeedToSync: {
        return i18n.t('Log.NoNeedToSync');
      }
      case GitStep.LocalAheadStartUpload: {
        return i18n.t('Log.LocalAheadStartUpload');
      }
      case GitStep.CheckingLocalSyncState: {
        return i18n.t('Log.CheckingLocalSyncState');
      }
      case GitStep.CheckingLocalGitRepoSanity: {
        return i18n.t('Log.CheckingLocalGitRepoSanity');
      }
      case GitStep.LocalStateBehindSync: {
        return i18n.t('Log.LocalStateBehindSync');
      }
      case GitStep.LocalStateDivergeRebase: {
        return i18n.t('Log.LocalStateDivergeRebase');
      }
      case GitStep.RebaseResultChecking: {
        return i18n.t('Log.CheckingRebaseStatus');
      }
      case GitStep.RebaseConflictNeedsResolve: {
        return i18n.t('Log.RebaseConflictNeedsResolve');
      }
      case GitStep.RebaseSucceed: {
        return i18n.t('Log.RebaseSucceed');
      }
      case GitStep.GitPushFailed: {
        return i18n.t('Log.GitPushFailed');
      }
      case GitStep.GitMergeFailed: {
        return i18n.t('Log.GitMergeFailed');
      }
      case GitStep.SyncFailedAlgorithmWrong: {
        return i18n.t('Log.SyncFailedSystemError');
      }
      case GitStep.PerformLastCheckBeforeSynchronizationFinish: {
        return i18n.t('Log.PerformLastCheckBeforeSynchronizationFinish');
      }
      case GitStep.SynchronizationFinish: {
        return i18n.t('Log.SynchronizationFinish');
      }
      case GitStep.StartFetchingFromGithubRemote: {
        return i18n.t('Log.StartFetchingFromGithubRemote');
      }
      case GitStep.CantSyncInSpecialGitStateAutoFixSucceed: {
        return i18n.t('Log.CantSyncInSpecialGitStateAutoFixSucceed');
      }
      default: {
        return message;
      }
    }
  }

  private translateErrorMessage(error: Error): void {
    logger.error(error?.message ?? error);
    if (error instanceof AssumeSyncError) {
      error.message = i18n.t('Log.SynchronizationFailed');
    } else if (error instanceof SyncParameterMissingError) {
      error.message = i18n.t('Log.GitTokenMissing') + error.parameterName;
    } else if (error instanceof GitPullPushError) {
      error.message = i18n.t('Log.SyncFailedSystemError');
    } else if (error instanceof CantSyncGitNotInitializedError) {
      error.message = i18n.t('Log.CantSyncGitNotInitialized');
    } else if (error instanceof SyncScriptIsInDeadLoopError) {
      error.message = i18n.t('Log.CantSynchronizeAndSyncScriptIsInDeadLoop');
    } else if (error instanceof CantSyncInSpecialGitStateAutoFixFailed) {
      error.message = i18n.t('Log.CantSyncInSpecialGitStateAutoFixFailed');
    }
    logger.error('↑Translated→: ' + error?.message ?? error);
    throw error;
  }

  public async initWikiGit(wikiFolderPath: string, isMainWiki: boolean, isSyncedWiki?: boolean, remoteUrl?: string, userInfo?: IGitUserInfos): Promise<void> {
    try {
      await initGit({
        dir: wikiFolderPath,
        remoteUrl,
        syncImmediately: isSyncedWiki,
        userInfo: { ...defaultGitInfo, ...userInfo },
        logger: {
          log: (message: string, context: ILoggerContext): unknown => logger.info(message, { callerFunction: 'initWikiGit', ...context }),
          warn: (message: string, context: ILoggerContext): unknown => logger.warn(message, { callerFunction: 'initWikiGit', ...context }),
          info: (message: GitStep, context: ILoggerContext): void => {
            logger.notice(this.translateMessage(message), { handler: WikiChannel.syncProgress, callerFunction: 'initWikiGit', ...context });
          },
        },
      });
    } catch (error) {
      this.translateErrorMessage(error);
    }
  }

  /**
   *
   * @param {string} wikiFolderPath
   * @param {string} remoteUrl
   * @param {{ login: string, email: string, accessToken: string }} userInfo
   */
  public async commitAndSync(wikiFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos): Promise<void> {
    try {
      await commitAndSync({
        dir: wikiFolderPath,
        remoteUrl,
        userInfo: { ...defaultGitInfo, ...userInfo },
        logger: {
          log: (message: string, context: ILoggerContext): unknown => logger.info(message, { callerFunction: 'commitAndSync', ...context }),
          warn: (message: string, context: ILoggerContext): unknown => logger.warn(message, { callerFunction: 'commitAndSync', ...context }),
          info: (message: GitStep, context: ILoggerContext): void => {
            logger.notice(this.translateMessage(message), { handler: WikiChannel.syncProgress, callerFunction: 'commitAndSync', ...context });
          },
        },
      });
    } catch (error) {
      this.translateErrorMessage(error);
    }
  }

  public async clone(remoteUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Promise<void> {
    try {
      await clone({
        dir: repoFolderPath,
        remoteUrl,
        userInfo: { ...defaultGitInfo, ...userInfo },
        logger: {
          log: (message: string, context: ILoggerContext): unknown => logger.info(message, { callerFunction: 'clone', ...context }),
          warn: (message: string, context: ILoggerContext): unknown => logger.warn(message, { callerFunction: 'clone', ...context }),
          info: (message: GitStep, context: ILoggerContext): void => {
            logger.notice(this.translateMessage(message), { handler: WikiChannel.syncProgress, callerFunction: 'clone', ...context });
          },
        },
      });
    } catch (error) {
      this.translateErrorMessage(error);
    }
  }
}
