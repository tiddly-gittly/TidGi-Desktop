import type { IWikiWorkspace } from '@services/workspaces/interface';
import path from 'node:path';
import type { TiddlyWiki } from 'tiddlywiki';

type WikiInstance = ReturnType<typeof TiddlyWiki>;

interface IFileSystemStore {
  directory: string;
}

interface IFileSystemChangeInfo {
  error?: Error;
  filepath?: string;
  operation: string;
  store?: IFileSystemStore;
  title?: string;
}

interface IFileSystemAdaptorCloseInfo {
  shouldClose: boolean;
}

const GIT_NOTIFICATION_DELAY_MS = 1000;
const SYNC_FROM_SERVER_DELAY_MS = 200;

function pathIsWithin(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath));
}

/**
 * Application-side effects remain outside the upstream adaptor. The adaptor
 * reports confirmed changes and errors through hooks; TidGi translates those
 * into its worker sync cadence, Git refreshes and alert tiddlers.
 */
export function installFileSystemIntegrationHooks(options: {
  gitNotifyFileChange: (wikiFolderLocation: string, options: { onlyWhenGitLogOpened: boolean }) => Promise<void>;
  mainWorkspace: IWikiWorkspace;
  nativeLog: (level: 'error' | 'info', message: string) => Promise<void>;
  subWikis: IWikiWorkspace[];
  wikiInstance: WikiInstance;
}): void {
  const {
    gitNotifyFileChange,
    mainWorkspace,
    nativeLog,
    subWikis,
    wikiInstance,
  } = options;
  const workspaces = [mainWorkspace, ...subWikis];
  const gitNotificationTimers = new Map<string, NodeJS.Timeout>();
  let syncFromServerTimer: NodeJS.Timeout | undefined;

  const findWorkspaceRoot = (info: IFileSystemChangeInfo): string => {
    const changedPath = info.store?.directory ?? info.filepath ?? mainWorkspace.wikiFolderLocation;
    return workspaces
      .map(workspace => path.resolve(workspace.wikiFolderLocation))
      .sort((left, right) => right.length - left.length)
      .find(workspacePath => pathIsWithin(workspacePath, changedPath)) ?? path.resolve(mainWorkspace.wikiFolderLocation);
  };

  const scheduleGitNotification = (info: IFileSystemChangeInfo): void => {
    const workspaceRoot = findWorkspaceRoot(info);
    const existingTimer = gitNotificationTimers.get(workspaceRoot);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      gitNotificationTimers.delete(workspaceRoot);
      void gitNotifyFileChange(workspaceRoot, { onlyWhenGitLogOpened: true }).catch((error: unknown) => {
        void nativeLog('error', `Filesystem Git refresh failed for ${workspaceRoot}: ${String(error)}`);
      });
    }, GIT_NOTIFICATION_DELAY_MS);
    timer.unref();
    gitNotificationTimers.set(workspaceRoot, timer);
  };

  const scheduleSyncFromServer = (): void => {
    if (syncFromServerTimer) {
      clearTimeout(syncFromServerTimer);
    }
    syncFromServerTimer = setTimeout(() => {
      syncFromServerTimer = undefined;
      wikiInstance.syncer?.syncFromServer();
    }, SYNC_FROM_SERVER_DELAY_MS);
    syncFromServerTimer.unref();
  };

  wikiInstance.hooks.addHook('th-filesystem-adaptor-should-close', (rawInfo: unknown) => {
    const info = rawInfo as IFileSystemAdaptorCloseInfo;
    // TidGi boots with a finite command and mounts its own IPC-backed server.
    // The worker shutdown path closes the adaptor explicitly.
    info.shouldClose = false;
    return info;
  });

  wikiInstance.hooks.addHook('th-filesystem-change', (rawInfo: unknown) => {
    const info = rawInfo as IFileSystemChangeInfo;
    scheduleGitNotification(info);
    return info;
  });

  wikiInstance.hooks.addHook('th-filesystem-watcher-change', (rawInfo: unknown) => {
    const info = rawInfo as IFileSystemChangeInfo;
    const markerOperation = info.operation === 'delete'
      ? 'DELETED'
      : info.operation === 'add'
      ? 'ADDED'
      : 'UPDATED';
    console.log(`[test-id-WATCH_FS_TIDDLER_${markerOperation}] ${info.title ?? ''}`);
    scheduleGitNotification(info);
    scheduleSyncFromServer();
    return info;
  });

  wikiInstance.hooks.addHook('th-filesystem-watcher-error', (rawInfo: unknown) => {
    const info = rawInfo as IFileSystemChangeInfo;
    void nativeLog('error', `Filesystem watcher failed: ${info.error?.message ?? 'Unknown error'}`);
    return info;
  });

  wikiInstance.hooks.addHook('th-filesystem-error', (rawInfo: unknown) => {
    const info = rawInfo as IFileSystemChangeInfo;
    const title = info.title ?? 'unknown';
    const message = `Filesystem ${info.operation} failed for "${title}": ${info.error?.message ?? 'Unknown error'}`;
    wikiInstance.wiki.addTiddler({
      title: `$:/temp/filesystem/error/${title}`,
      text: message,
      tags: ['$:/tags/Alert'],
      type: 'text/vnd.tiddlywiki',
      'error-type': 'file-save-error',
      'original-title': title,
      timestamp: new Date().toISOString(),
    });
    void nativeLog('error', message);
    return info;
  });
}
