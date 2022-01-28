/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { expose } from 'threads/worker';
import { Observable } from 'rxjs';
import { clone, commitAndSync, GitStep, ILoggerContext, initGit, getModifiedFileList, getRemoteUrl, SyncParameterMissingError } from 'git-sync-js';
import { IGitLogMessage, IGitUserInfos } from './interface';
import { defaultGitInfo } from './defaultGitInfo';
import { WikiChannel } from '@/constants/channels';

function initWikiGit(wikiFolderPath: string, syncImmediately?: boolean, remoteUrl?: string, userInfo?: IGitUserInfos): Observable<IGitLogMessage> {
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
          debug: (message: string, context: ILoggerContext): unknown =>
            observer.next({ message, level: 'debug', meta: { callerFunction: 'initWikiGit', ...context } }),
          warn: (message: string, context: ILoggerContext): unknown =>
            observer.next({ message, level: 'warn', meta: { callerFunction: 'initWikiGit', ...context } }),
          info: (message: GitStep, context: ILoggerContext): void => {
            observer.next({ message, level: 'notice', meta: { handler: WikiChannel.createProgress, callerFunction: 'initWikiGit', ...context } });
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
          debug: (message: string, context: ILoggerContext): unknown =>
            observer.next({ message, level: 'debug', meta: { callerFunction: 'initWikiGit', ...context } }),
          warn: (message: string, context: ILoggerContext): unknown =>
            observer.next({ message, level: 'warn', meta: { callerFunction: 'initWikiGit', ...context } }),
          info: (message: GitStep, context: ILoggerContext): void => {
            observer.next({ message, level: 'notice', meta: { handler: WikiChannel.createProgress, callerFunction: 'initWikiGit', ...context } });
          },
        },
      });
    }
    void task.then(
      () => observer.complete(),
      (error) => observer.error(error),
    );
  });
}

/**
 *
 * @param {string} wikiFolderPath
 * @param {string} remoteUrl
 * @param {{ login: string, email: string, accessToken: string }} userInfo
 */
function commitAndSyncWiki(wikiFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    void commitAndSync({
      dir: wikiFolderPath,
      remoteUrl,
      userInfo,
      defaultGitInfo,
      logger: {
        debug: (message: string, context: ILoggerContext): unknown =>
          observer.next({ message, level: 'debug', meta: { callerFunction: 'commitAndSync', ...context } }),
        warn: (message: string, context: ILoggerContext): unknown =>
          observer.next({ message, level: 'warn', meta: { callerFunction: 'commitAndSync', ...context } }),
        info: (message: GitStep, context: ILoggerContext): void => {
          observer.next({ message, level: 'notice', meta: { handler: WikiChannel.syncProgress, callerFunction: 'commitAndSync', ...context } });
        },
      },
      filesToIgnore: ['.DS_Store'],
    }).then(
      () => observer.complete(),
      (error) => observer.error(error),
    );
  });
}

function cloneWiki(repoFolderPath: string, remoteUrl: string, userInfo: IGitUserInfos): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    void clone({
      dir: repoFolderPath,
      remoteUrl,
      userInfo,
      defaultGitInfo,
      logger: {
        debug: (message: string, context: ILoggerContext): unknown => observer.next({ message, level: 'debug', meta: { callerFunction: 'clone', ...context } }),
        warn: (message: string, context: ILoggerContext): unknown => observer.next({ message, level: 'warn', meta: { callerFunction: 'clone', ...context } }),
        info: (message: GitStep, context: ILoggerContext): void => {
          observer.next({ message, level: 'notice', meta: { handler: WikiChannel.createProgress, callerFunction: 'clone', ...context } });
        },
      },
    }).then(
      () => observer.complete(),
      (error) => observer.error(error),
    );
  });
}

const gitWorker = { initWikiGit, commitAndSyncWiki, cloneWiki, getModifiedFileList, getRemoteUrl };
export type GitWorker = typeof gitWorker;
expose(gitWorker);
