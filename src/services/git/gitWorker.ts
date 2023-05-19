/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { WikiChannel } from '@/constants/channels';
import type { IWorkspace } from '@services/workspaces/interface';
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
  SyncParameterMissingError,
  SyncScriptIsInDeadLoopError,
} from 'git-sync-js';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';
import { defaultGitInfo } from './defaultGitInfo';
import type { ICommitAndSyncConfigs, IGitLogMessage, IGitUserInfos } from './interface';

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
      (error) => {
        if (error instanceof Error) {
          observer.next({ message: `${error.message} ${error.stack ?? ''}`, level: 'warn', meta: { callerFunction: 'initWikiGit' } });
          translateAndLogErrorMessage(error, errorI18NDict);
          observer.next({ level: 'error', error });
        } else {
          observer.next({ message: String(error), level: 'warn', meta: { callerFunction: 'initWikiGit' } });
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
      dir: workspace.wikiFolderLocation,
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
      (error) => {
        if (error instanceof Error) {
          observer.next({ message: `${error.message} ${error.stack ?? ''}`, level: 'warn', meta: { callerFunction: 'commitAndSync' } });
          translateAndLogErrorMessage(error, errorI18NDict);
          observer.next({ level: 'error', error });
        } else {
          observer.next({ message: String(error), level: 'warn', meta: { callerFunction: 'commitAndSync' } });
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
      (error) => {
        if (error instanceof Error) {
          observer.next({ message: `${error.message} ${error.stack ?? ''}`, level: 'warn', meta: { callerFunction: 'clone' } });
          translateAndLogErrorMessage(error, errorI18NDict);
          observer.next({ level: 'error', error });
        } else {
          observer.next({ message: String(error), level: 'warn', meta: { callerFunction: 'clone' } });
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
  }
}

const gitWorker = { initWikiGit, commitAndSyncWiki, cloneWiki, getModifiedFileList, getRemoteUrl };
export type GitWorker = typeof gitWorker;
expose(gitWorker);
