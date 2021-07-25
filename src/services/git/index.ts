import { ipcMain } from 'electron';
import { injectable, inject } from 'inversify';
import { debounce } from 'lodash';
import {
  AssumeSyncError,
  CantSyncGitNotInitializedError,
  CantSyncInSpecialGitStateAutoFixFailed,
  getModifiedFileList,
  getRemoteUrl,
  GitPullPushError,
  GitStep,
  ModifiedFileList,
  SyncParameterMissingError,
  SyncScriptIsInDeadLoopError,
  hasGit,
} from 'git-sync-js';
import { spawn, Worker, ModuleThread } from 'threads';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';
import { IGitLogMessage, IGitService, IGitUserInfos } from './interface';
import { WikiChannel } from '@/constants/channels';
import { GitWorker } from './gitWorker';
import { Observer } from 'rxjs';

// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=gitWorker!./gitWorker.ts';
import { LOCAL_GIT_DIRECTORY } from '@/constants/appPaths';

@injectable()
export class Git implements IGitService {
  private gitWorker?: ModuleThread<GitWorker>;

  constructor(
    @inject(serviceIdentifier.View) private readonly viewService: IViewService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    void this.initWorker();
    this.debounceCommitAndSync = this.commitAndSync.bind(this);
    void this.preferenceService.get('syncDebounceInterval').then((syncDebounceInterval) => {
      this.debounceCommitAndSync = debounce(this.commitAndSync.bind(this), syncDebounceInterval);
    });
  }

  private async initWorker(): Promise<void> {
    process.env.LOCAL_GIT_DIRECTORY = LOCAL_GIT_DIRECTORY;
    this.gitWorker = await spawn<GitWorker>(new Worker(workerURL));
  }

  public debounceCommitAndSync: (wikiFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos) => Promise<void> | undefined;

  public async getWorkspacesRemote(wikiFolderPath: string): Promise<string | undefined> {
    if (await hasGit(wikiFolderPath)) {
      return await getRemoteUrl(wikiFolderPath);
    }
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

  private translateAndLogErrorMessage(error: Error): void {
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

  private readonly getWorkerObserver = (resolve: () => void, reject: (error: Error) => void): Observer<IGitLogMessage> => ({
    next: (message) => {
      logger.log(message.level, this.translateMessage(message.message), message.meta);
    },
    error: (error) => {
      this.translateAndLogErrorMessage(error);
      reject(error);
    },
    complete: () => resolve(),
  });

  public async initWikiGit(wikiFolderPath: string, isSyncedWiki?: boolean, remoteUrl?: string, userInfo?: IGitUserInfos): Promise<void> {
    return await new Promise<void>((resolve, reject) => {
      this.gitWorker?.initWikiGit(wikiFolderPath, isSyncedWiki, remoteUrl, userInfo).subscribe(this.getWorkerObserver(resolve, reject));
    });
  }

  public async commitAndSync(wikiFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos): Promise<void> {
    return await new Promise<void>((resolve, reject) => {
      this.gitWorker?.commitAndSyncWiki(wikiFolderPath, remoteUrl, userInfo).subscribe(this.getWorkerObserver(resolve, reject));
    });
  }

  public async clone(remoteUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Promise<void> {
    return await new Promise<void>((resolve, reject) => {
      this.gitWorker?.cloneWiki(repoFolderPath, remoteUrl, userInfo).subscribe(this.getWorkerObserver(resolve, reject));
    });
  }
}
