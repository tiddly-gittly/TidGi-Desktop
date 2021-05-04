/* eslint-disable @typescript-eslint/no-misused-promises */
import { expose } from 'threads/worker';
import { Observable } from 'rxjs';
import { clone, commitAndSync, GitStep, ILoggerContext, initGit } from 'git-sync-js';
import { IGitLogMessage, IGitUserInfos } from './interface';
import { defaultGitInfo } from './defaultGitInfo';
import { WikiChannel } from '@/constants/channels';

function initWikiGit(wikiFolderPath: string, isSyncedWiki?: boolean, remoteUrl?: string, userInfo?: IGitUserInfos): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    void initGit({
      dir: wikiFolderPath,
      remoteUrl,
      syncImmediately: isSyncedWiki,
      userInfo: { ...defaultGitInfo, ...userInfo },
      logger: {
        log: (message: string, context: ILoggerContext): unknown =>
          observer.next({ message, level: 'log', meta: { callerFunction: 'initWikiGit', ...context } }),
        warn: (message: string, context: ILoggerContext): unknown =>
          observer.next({ message, level: 'warn', meta: { callerFunction: 'initWikiGit', ...context } }),
        info: (message: GitStep, context: ILoggerContext): void => {
          observer.next({ message, level: 'notice', meta: { handler: WikiChannel.createProgress, callerFunction: 'initWikiGit', ...context } });
        },
      },
    }).then(
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
      userInfo: { ...defaultGitInfo, ...userInfo },
      logger: {
        log: (message: string, context: ILoggerContext): unknown =>
          observer.next({ message, level: 'log', meta: { callerFunction: 'commitAndSync', ...context } }),
        warn: (message: string, context: ILoggerContext): unknown =>
          observer.next({ message, level: 'warn', meta: { callerFunction: 'commitAndSync', ...context } }),
        info: (message: GitStep, context: ILoggerContext): void => {
          observer.next({ message, level: 'notice', meta: { handler: WikiChannel.syncProgress, callerFunction: 'commitAndSync', ...context } });
        },
      },
    }).then(
      () => observer.complete(),
      (error) => observer.error(error),
    );
  });
}

function cloneWiki(remoteUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Observable<IGitLogMessage> {
  return new Observable<IGitLogMessage>((observer) => {
    void clone({
      dir: repoFolderPath,
      remoteUrl,
      userInfo: { ...defaultGitInfo, ...userInfo },
      logger: {
        log: (message: string, context: ILoggerContext): unknown => observer.next({ message, level: 'log', meta: { callerFunction: 'clone', ...context } }),
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

const gitWorker = { initWikiGit, commitAndSyncWiki, cloneWiki };
export type GitWorker = typeof gitWorker;
expose(gitWorker);
