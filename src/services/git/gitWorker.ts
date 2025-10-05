import 'source-map-support/register';
import { WikiChannel } from '@/constants/channels';
import { handleWorkerMessages } from '@services/libs/workerAdapter';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import {
  AssumeSyncError,
  CantForcePullError,
  CantSyncGitNotInitializedError,
  CantSyncInSpecialGitStateAutoFixFailed,
  clone,
  commitAndSync,
  forcePull,
  getModifiedFileList,
  getRemoteUrl,
  GitPullPushError,
  GitStep,
  ILoggerContext,
  initGit,
  SyncParameterMissingError,
  SyncScriptIsInDeadLoopError,
} from 'git-sync-js';
import { Observable } from 'rxjs';
import { defaultGitInfo } from './defaultGitInfo';
import type { ICommitAndSyncConfigs, IForcePullConfigs, IGitLogMessage, IGitUserInfos } from './interface';

function initWikiGit(
  wikiFolderPath: string,
  errorI18NDict: Record<string, string>,
  syncImmediately?: boolean,
  remoteUrl?: string,
  userInfo?: IGitUserInfos,
): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    let task: Promise<void>;
    if (syncImmediately === true) {
      if (remoteUrl === undefined) {
        throw new SyncParameterMissingError('remoteUrl');
      }
      if (userInfo === undefined) {
        throw new SyncParameterMissingError('userInfo');
      }
      task = initGit({
        dir: wikiFolderPath,
        remoteUrl,
        syncImmediately,
        userInfo,
        defaultGitInfo,
        logger: {
          debug: (message: string, context: ILoggerContext): void => {
            observer.next({ message, level: 'debug', meta: { callerFunction: 'initWikiGit', ...context } });
          },
          warn: (message: string, context: ILoggerContext): void => {
            observer.next({ message, level: 'warn', meta: { callerFunction: 'initWikiGit', ...context } });
          },
          info: (message: GitStep, context: ILoggerContext): void => {
            observer.next({ message, level: 'info', meta: { handler: WikiChannel.createProgress, callerFunction: 'initWikiGit', ...context } });
          },
        },
      });
    } else {
      task = initGit({
        dir: wikiFolderPath,
        syncImmediately,
        userInfo,
        defaultGitInfo,
        logger: {
          debug: (message: string, context: ILoggerContext): void => {
            observer.next({ message, level: 'debug', meta: { callerFunction: 'initWikiGit', ...context } });
          },
          warn: (message: string, context: ILoggerContext): void => {
            observer.next({ message, level: 'warn', meta: { callerFunction: 'initWikiGit', ...context } });
          },
          info: (message: GitStep, context: ILoggerContext): void => {
            observer.next({ message, level: 'info', meta: { handler: WikiChannel.createProgress, callerFunction: 'initWikiGit', ...context } });
          },
        },
      });
    }
    void task.then(
      () => {
        observer.complete();
      },
      (_error: unknown) => {
        if (_error instanceof Error) {
          observer.next({ message: `${_error.message} ${_error.stack ?? ''}`, level: 'warn', meta: { callerFunction: 'initWikiGit' } });
          translateAndLogErrorMessage(_error, errorI18NDict);
          observer.next({ level: 'error', error: _error });
        } else {
          observer.next({ message: String(_error), level: 'warn', meta: { callerFunction: 'initWikiGit' } });
        }
        observer.complete();
      },
    );
  });
}

/**
 * @param {string} wikiFolderPath
 * @param {string} remoteUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 */
function commitAndSyncWiki(workspace: IWorkspace, configs: ICommitAndSyncConfigs, errorI18NDict: Record<string, string>): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    void commitAndSync({
      ...configs,
      defaultGitInfo,
      logger: {
        debug: (message: string, context: ILoggerContext): void => {
          observer.next({ message, level: 'debug', meta: { callerFunction: 'commitAndSync', ...context } });
        },
        warn: (message: string, context: ILoggerContext): void => {
          observer.next({ message, level: 'warn', meta: { callerFunction: 'commitAndSync', ...context } });
        },
        info: (message: GitStep, context: ILoggerContext): void => {
          observer.next({ message, level: 'info', meta: { handler: WikiChannel.syncProgress, id: workspace.id, callerFunction: 'commitAndSync', ...context } });
        },
      },
      filesToIgnore: ['.DS_Store'],
    }).then(
      () => {
        observer.complete();
      },
      (_error: unknown) => {
        if (_error instanceof Error) {
          observer.next({ message: `${_error.message} ${_error.stack ?? ''}`, level: 'warn', meta: { callerFunction: 'commitAndSync' } });
          translateAndLogErrorMessage(_error, errorI18NDict);
          observer.next({ level: 'error', error: _error });
        } else {
          observer.next({ message: String(_error), level: 'warn', meta: { callerFunction: 'commitAndSync' } });
        }
        observer.complete();
      },
    );
  });
}

/**
 * @param {string} wikiFolderPath
 * @param {string} remoteUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 */
function forcePullWiki(workspace: IWorkspace, configs: IForcePullConfigs, errorI18NDict: Record<string, string>): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    if (!isWikiWorkspace(workspace)) {
      observer.error(new Error('forcePullWiki can only be called on wiki workspaces'));
      return;
    }
    void forcePull({
      dir: workspace.wikiFolderLocation,
      ...configs,
      defaultGitInfo,
      logger: {
        debug: (message: string, context: ILoggerContext): void => {
          observer.next({ message, level: 'debug', meta: { callerFunction: 'forcePull', ...context } });
        },
        warn: (message: string, context: ILoggerContext): void => {
          observer.next({ message, level: 'warn', meta: { callerFunction: 'forcePull', ...context } });
        },
        info: (message: GitStep, context: ILoggerContext): void => {
          observer.next({ message, level: 'info', meta: { handler: WikiChannel.syncProgress, id: workspace.id, callerFunction: 'forcePull', ...context } });
        },
      },
    }).then(
      () => {
        observer.complete();
      },
      (_error: unknown) => {
        if (_error instanceof Error) {
          observer.next({ message: `${_error.message} ${_error.stack ?? ''}`, level: 'warn', meta: { callerFunction: 'forcePull' } });
          translateAndLogErrorMessage(_error, errorI18NDict);
          observer.next({ level: 'error', error: _error });
        } else {
          observer.next({ message: String(_error), level: 'warn', meta: { callerFunction: 'forcePull' } });
        }
        observer.complete();
      },
    );
  });
}

function cloneWiki(repoFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos, errorI18NDict: Record<string, string>): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    void clone({
      dir: repoFolderPath,
      remoteUrl,
      userInfo,
      defaultGitInfo,
      logger: {
        debug: (message: string, context: ILoggerContext): void => {
          observer.next({ message, level: 'debug', meta: { callerFunction: 'clone', ...context } });
        },
        warn: (message: string, context: ILoggerContext): void => {
          observer.next({ message, level: 'warn', meta: { callerFunction: 'clone', ...context } });
        },
        info: (message: GitStep, context: ILoggerContext): void => {
          observer.next({ message, level: 'info', meta: { handler: WikiChannel.createProgress, callerFunction: 'clone', ...context } });
        },
      },
    }).then(
      () => {
        observer.complete();
      },
      (_error: unknown) => {
        if (_error instanceof Error) {
          observer.next({ message: `${_error.message} ${_error.stack ?? ''}`, level: 'warn', meta: { callerFunction: 'clone' } });
          translateAndLogErrorMessage(_error, errorI18NDict);
          observer.next({ level: 'error', error: _error });
        } else {
          observer.next({ message: String(_error), level: 'warn', meta: { callerFunction: 'clone' } });
        }
        observer.complete();
      },
    );
  });
}

function translateAndLogErrorMessage(error: Error, errorI18NDict: Record<string, string>): void {
  if (error instanceof AssumeSyncError) {
    error.message = errorI18NDict.AssumeSyncError;
  } else if (error instanceof SyncParameterMissingError) {
    error.message = errorI18NDict.SyncParameterMissingError + error.parameterName;
  } else if (error instanceof GitPullPushError) {
    error.message = errorI18NDict.GitPullPushError;
  } else if (error instanceof CantSyncGitNotInitializedError) {
    error.message = errorI18NDict.CantSyncGitNotInitializedError;
  } else if (error instanceof SyncScriptIsInDeadLoopError) {
    error.message = errorI18NDict.SyncScriptIsInDeadLoopError;
  } else if (error instanceof CantSyncInSpecialGitStateAutoFixFailed) {
    error.message = errorI18NDict.CantSyncInSpecialGitStateAutoFixFailed;
  } else if (error instanceof CantForcePullError) {
    error.message = errorI18NDict.CantForcePullError;
  }
}

const gitWorker = { initWikiGit, commitAndSyncWiki, cloneWiki, forcePullWiki, getModifiedFileList, getRemoteUrl };
export type GitWorker = typeof gitWorker;

// Initialize worker message handling
handleWorkerMessages(gitWorker);
