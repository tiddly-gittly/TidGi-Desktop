import { i18n } from '@services/libs/i18n';
import { GitStep } from 'git-sync-js';

export function getErrorMessageI18NDict() {
  return {
    AssumeSyncError: i18n.t('Log.SynchronizationFailed'),
    SyncParameterMissingError: i18n.t('Log.GitTokenMissing'), // + error.parameterName,
    GitPullPushError: i18n.t('Log.SyncFailedSystemError'),
    CantSyncGitNotInitializedError: i18n.t('Log.CantSyncGitNotInitialized'),
    SyncScriptIsInDeadLoopError: i18n.t('Log.CantSynchronizeAndSyncScriptIsInDeadLoop'),
    CantSyncInSpecialGitStateAutoFixFailed: i18n.t('Log.CantSyncInSpecialGitStateAutoFixFailed'),
    CantForcePullError: i18n.t('Log.CantForcePullError'),
  };
}

export function translateMessage(message: string): string {
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
    case GitStep.StartForcePull: {
      return i18n.t('Log.StartForcePull');
    }
    case GitStep.SkipForcePull: {
      return i18n.t('Log.SkipForcePull');
    }
    case GitStep.StartResettingLocalToRemote: {
      return i18n.t('Log.StartResettingLocalToRemote');
    }
    case GitStep.FinishForcePull: {
      return i18n.t('Log.FinishForcePull');
    }
    default: {
      return message;
    }
  }
}
