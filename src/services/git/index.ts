import { app, dialog, net, type UtilityProcess } from 'electron';
import { createWorkerMethodProxy, type WorkerPeer } from 'electron-ipc-cat/host';
import { getRemoteName, getRemoteUrl, GitStep, ModifiedFileList, stepsAboutChange } from 'git-sync-js';
import { inject, injectable } from 'inversify';
import path from 'node:path';
import { BehaviorSubject, Observer } from 'rxjs';
import GitWorkerFactory from './gitWorker?utilityProcess';

import { LOCAL_GIT_DIRECTORY } from '@/constants/appPaths';
import { WikiChannel } from '@/constants/channels';
import type { IAuthenticationService, ServiceBranchTypes } from '@services/auth/interface';
import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { i18n } from '@services/libs/i18n';
import { getLogger, logger, workspaceLogContext } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkerInfo } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { isWikiWorkspace, type IWorkspace, type IWorkspaceGitScope } from '@services/workspaces/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { computeGitScopePaths, getWorkspaceGitScope as resolveWorkspaceGitScope, isHtmlWikiWorkspace } from '@services/workspaces/workspacePaths';
import * as gitOperations from './gitOperations';
import type { GitWorker } from './gitWorker';
import type { ICommitAndSyncConfigs, IForcePullConfigs, IGitLogMessage, IGitService, IGitStateChange, IGitSyncProgressEvent, IGitUserInfos } from './interface';
import { registerMenu } from './registerMenu';
import { getErrorMessageI18NDict, translateMessage } from './translateMessage';

@injectable()
export class Git implements IGitService {
  private readonly workers = new Map<string, { proxy: GitWorker; nativeWorker: UtilityProcess }>();
  public gitStateChange$ = new BehaviorSubject<IGitStateChange | undefined>(undefined);
  public gitSyncProgress$ = new BehaviorSubject<IGitSyncProgressEvent | undefined>(undefined);
  private operationLocks = new Map<string, Promise<void>>();
  private inflightCallGitOps = new Map<string, Promise<unknown>>();

  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.NativeService) private readonly nativeService: INativeService,
    @inject(serviceIdentifier.Window) private readonly windowService: IWindowService,
  ) {}

  /**
   * Acquire a per-workspace lock to serialize git operations.
   * Returns a release function that must be called in a finally block.
   * Includes a timeout so that if a previous operation is stuck (e.g. due to a hibernated workspace or a hung git process),
   * the current operation fails fast instead of blocking indefinitely.
   */
  private async acquireOperationLock(workspaceID: string): Promise<() => void> {
    const previousLock = this.operationLocks.get(workspaceID);

    if (previousLock !== undefined) {
      const LOCK_TIMEOUT_MS = 30_000;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<void>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Previous git operation is still running for workspace ${workspaceID} after ${LOCK_TIMEOUT_MS}ms`));
        }, LOCK_TIMEOUT_MS);
      });
      try {
        await Promise.race([previousLock, timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    // Only set the new lock after the previous one has been successfully released.
    // This prevents a dead lock if the timeout above rejects — the new promise
    // would never be resolved if it were set before the await.
    let release: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.operationLocks.set(workspaceID, promise);

    return () => {
      release!();
      if (this.operationLocks.get(workspaceID) === promise) {
        this.operationLocks.delete(workspaceID);
      }
    };
  }

  private notifyGitStateChange(wikiFolderLocation: string, type: IGitStateChange['type']): void {
    const change = {
      timestamp: Date.now(),
      wikiFolderLocation,
      type,
    };
    logger.debug('notifyGitStateChange called', change);
    this.gitStateChange$.next(change);
  }

  /**
   * Resolve the git repo path to operate on for a workspace. For scoped workspaces this is the
   * ancestor repo root; otherwise it falls back to the wiki folder. Notification always uses
   * `workspace.wikiFolderLocation` (the renderer's gitStateChange$ filter key), so the git op
   * path and the notification key are deliberately separated.
   */
  private resolveRepoPath(workspace: IWorkspace): string {
    if (!isWikiWorkspace(workspace)) return '';
    return resolveWorkspaceGitScope(workspace)?.repoPath ?? workspace.wikiFolderLocation;
  }

  /**
   * Public method to notify file system changes
   * Called by watch-fs plugin when files are modified
   */
  public notifyFileChange(wikiFolderLocation: string, options?: { onlyWhenGitLogOpened?: boolean }): void {
    const { onlyWhenGitLogOpened = true } = options ?? {};

    // If we should only notify when git log is open, check if the window exists
    if (onlyWhenGitLogOpened) {
      const gitLogWindow = this.windowService.get(WindowNames.gitHistory);

      // If no git log window is open, skip notification
      if (!gitLogWindow) {
        return;
      }
    }

    this.notifyGitStateChange(wikiFolderLocation, 'file-change');
  }

  public async initialize(): Promise<void> {
    process.env.LOCAL_GIT_DIRECTORY = LOCAL_GIT_DIRECTORY;
    // Register menu items after initialization
    void registerMenu();
  }

  private async resolveWorkspaceForRepoPath(repoPath: string): Promise<IWorkspace | undefined> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspaces = await workspaceService.getWorkspacesAsList();
    const normalizedRepoPath = path.resolve(repoPath);
    return workspaces.find(workspace => {
      if (!isWikiWorkspace(workspace)) return false;
      const scope = resolveWorkspaceGitScope(workspace);
      const workspaceRepoPath = path.resolve(scope?.repoPath ?? workspace.wikiFolderLocation);
      return process.platform === 'win32'
        ? workspaceRepoPath.toLocaleLowerCase() === normalizedRepoPath.toLocaleLowerCase()
        : workspaceRepoPath === normalizedRepoPath;
    });
  }

  private getWorker(workspace?: IWorkspace): GitWorker {
    const key = workspace?.id ?? '__global__';
    const existing = this.workers.get(key);
    if (existing !== undefined) return existing.proxy;

    const child = GitWorkerFactory({
      stdio: 'pipe',
      serviceName: workspace === undefined ? 'git-worker-global' : `git-worker-${workspace.id}`,
      allowLoadingUnsignedLibraries: process.platform === 'darwin',
    });
    const proxy = createWorkerMethodProxy<GitWorker>(child as unknown as WorkerPeer);
    this.workers.set(key, { proxy, nativeWorker: child });
    const workerLogger = workspace === undefined
      ? getLogger({ process: 'git-worker', scope: { kind: 'global' }, component: 'git-worker' })
      : getLogger(workspaceLogContext(workspace.id, workspace.name, 'git-worker'));
    workerLogger.info('Git worker started', { workspaceID: workspace?.id, pid: child.pid });
    child.stdout?.on('data', (data: Buffer) => {
      workerLogger.debug(data.toString().trim(), { stream: 'stdout' });
    });
    child.stderr?.on('data', (data: Buffer) => {
      workerLogger.warn(data.toString().trim(), { stream: 'stderr' });
    });
    child.on('exit', (code: number) => {
      if (this.workers.get(key)?.nativeWorker === child) this.workers.delete(key);
      workerLogger.log(code === 0 ? 'info' : 'error', 'Git worker exited', { code, workspaceID: workspace?.id });
    });
    return proxy;
  }

  private async getWorkerForRepoPath(repoPath: string): Promise<{ worker: GitWorker; workspace?: IWorkspace }> {
    const workspace = await this.resolveWorkspaceForRepoPath(repoPath);
    return { worker: this.getWorker(workspace), workspace };
  }

  private async getWorkspaceByID(workspaceID: string): Promise<IWorkspace | undefined> {
    return await container.get<IWorkspaceService>(serviceIdentifier.Workspace).get(workspaceID);
  }

  public async getWorkerInfo(): Promise<IWorkerInfo | undefined> {
    return (await this.getWorkerInfos())[0];
  }

  public async getWorkerInfos(): Promise<IWorkerInfo[]> {
    const metricsMap = new Map<number, Electron.ProcessMetric>();
    for (const metric of app.getAppMetrics()) {
      metricsMap.set(metric.pid, metric);
    }
    return await Promise.all([...this.workers.entries()].map(async ([workspaceID, workerEntry]) => {
      const pid = workerEntry.nativeWorker.pid ?? null;
      const metric = pid === null ? undefined : metricsMap.get(pid);
      let heapUsed_MB: number | null = null;
      let heapTotal_MB: number | null = null;
      let rss_MB: number | null = null;
      try {
        const mem = await workerEntry.proxy.getMemoryUsage();
        heapUsed_MB = mem.heapUsed_MB;
        heapTotal_MB = mem.heapTotal_MB;
        rss_MB = mem.rss_MB;
      } catch {
        // Worker may be busy or exiting.
      }
      if (rss_MB === null && metric) rss_MB = Math.round(metric.memory.workingSetSize / 1024);
      const workspace = workspaceID === '__global__' ? undefined : await this.getWorkspaceByID(workspaceID);
      return {
        workspaceID,
        workspaceName: workspace === undefined ? 'Git Worker (global)' : `Git: ${workspace.name}`,
        port: null,
        isRunning: true,
        pid,
        cpu_percent: metric ? Math.round(metric.cpu.percentCPUUsage * 100) / 100 : null,
        rss_MB,
        heapUsed_MB,
        heapTotal_MB,
      };
    }));
  }

  public async getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]> {
    const { worker } = await this.getWorkerForRepoPath(wikiFolderPath);
    const list = await worker.getModifiedFileList(wikiFolderPath);
    return list ?? [];
  }

  public async getWorkspacesRemote(wikiFolderPath?: string): Promise<string | undefined> {
    if (!wikiFolderPath) return;
    const branch = (await this.authService.get('git-branch' as ServiceBranchTypes)) ?? 'main';
    const defaultRemoteName = (await getRemoteName(wikiFolderPath, branch)) ?? 'origin';
    const remoteUrl = await getRemoteUrl(wikiFolderPath, defaultRemoteName);
    return remoteUrl;
  }

  public async discoverAncestorGitRepos(startPath: string): Promise<string[]> {
    return gitOperations.discoverAncestorGitRepos(startPath);
  }

  public async getWorkspaceGitScope(workspace: IWorkspace): Promise<IWorkspaceGitScope | undefined> {
    return resolveWorkspaceGitScope(workspace);
  }

  public async computeGitScopePaths(wikiFolderLocation: string, ancestorRepoRoot: string): Promise<{ gitRepoPath: string; gitManagedRelativePath: string }> {
    return computeGitScopePaths(wikiFolderLocation, ancestorRepoRoot);
  }

  /**
   * Update in-wiki settings for git. Only needed if the wiki is config to synced.
   * @param {string} remoteUrl
   */
  private async updateGitInfoTiddler(workspace: IWorkspace, remoteUrl?: string, branch?: string): Promise<void> {
    // at least 'http://', but in some case it might be shorter, like 'a.b'
    if (remoteUrl === undefined || remoteUrl.length < 3) return;
    if (branch === undefined) return;
    // "/tiddly-gittly/TidGi-Desktop/issues/370"
    let url: URL;
    try {
      url = new URL(remoteUrl);
    } catch {
      // SSH URLs (e.g. git@github.com:user/repo.git) are not valid URLs.
      // Skip updating the git info tiddler for SSH remotes.
      return;
    }
    const { pathname } = url;
    // [ "", "tiddly-gittly", "TidGi-Desktop", "issues", "370" ]
    const [, userName, repoName] = pathname.split('/');
    /**
     * similar to "linonetwo/wiki", string after "https://com/"
     */
    const githubRepoName = `${userName}/${repoName}`;
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    // Use wikiOperationInServer so the write goes directly through the wiki worker's filesystem
    // adapter, which has boot.files correctly populated and can overwrite the existing .tid file
    // without appending numeric suffixes.
    if ((await wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspace.id, ['$:/GitHub/Repo'])) !== githubRepoName) {
      await wikiService.wikiOperationInServer(WikiChannel.addTiddler, workspace.id, ['$:/GitHub/Repo', githubRepoName]);
    }
    if ((await wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspace.id, ['$:/GitHub/Branch'])) !== branch) {
      await wikiService.wikiOperationInServer(WikiChannel.addTiddler, workspace.id, ['$:/GitHub/Branch', branch]);
    }
  }

  private popGitErrorNotificationToUser(step: GitStep, message: string): void {
    if (step === GitStep.GitPushFailed && message.includes('403')) {
      const windowService = container.get<IWindowService>(serviceIdentifier.Window);
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow !== undefined) {
        void dialog.showMessageBox(mainWindow, {
          title: i18n.t('Log.GitTokenMissing'),
          message: `${i18n.t('Log.GitTokenExpireOrWrong')} (${message})`,
          buttons: ['OK'],
          cancelId: 0,
          defaultId: 0,
        });
      }
    }
  }

  /**
   * Handle common error dialog and message dialog
   */
  private readonly getWorkerMessageObserver = (wikiFolderPath: string, resolve: () => void, reject: (error: Error) => void, workspaceID?: string): Observer<IGitLogMessage> => ({
    next: (messageObject) => {
      if (messageObject.level === 'error') {
        const errorMessage = messageObject.error.message;
        // if workspace exists, show notification in workspace, else use dialog instead
        if (workspaceID === undefined) {
          this.createFailedDialog(errorMessage, wikiFolderPath);
        } else {
          this.createFailedNotification(errorMessage, workspaceID);
        }
        // Reject the promise on error to prevent service restart
        reject(messageObject.error);
        return;
      }
      const { message, meta, level } = messageObject;
      if (
        typeof meta === 'object' &&
        meta !== null &&
        'handler' in meta &&
        (meta as { handler?: string }).handler === WikiChannel.syncProgress &&
        'id' in meta &&
        typeof (meta as { id?: unknown }).id === 'string'
      ) {
        this.gitSyncProgress$.next({
          workspaceID: (meta as { id: string }).id,
          message: translateMessage(message),
        });
      }
      if (typeof meta === 'object' && meta !== null && 'step' in meta) {
        this.popGitErrorNotificationToUser((meta as { step: GitStep }).step, message);
      }
      const operationLogger = workspaceID === undefined
        ? getLogger({ process: 'git-worker', scope: { kind: 'global' }, component: 'git-worker' })
        : getLogger(workspaceLogContext(workspaceID, undefined, 'git-worker'));
      operationLogger.log(level, translateMessage(message), meta);
    },
    error: (error) => {
      // this normally won't happen. And will become unhandled error. Because Observable error can't be catch, don't know why.
      reject(error as Error);
    },
    complete: () => {
      resolve();
    },
  });

  private createFailedNotification(message: string, workspaceID: string) {
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    void wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, workspaceID, [`${i18n.t('Log.SynchronizationFailed')} ${message}`]);
  }

  private createFailedDialog(message: string, wikiFolderPath: string): void {
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    const mainWindow = windowService.get(WindowNames.main);
    if (mainWindow !== undefined) {
      void dialog
        .showMessageBox(mainWindow, {
          title: i18n.t('Log.SynchronizationFailed'),
          message,
          buttons: ['OK', 'Github Desktop'],
          cancelId: 0,
          defaultId: 1,
        })
        .then(async ({ response }) => {
          if (response === 1) {
            await this.nativeService.openInGitGuiApp(wikiFolderPath);
          }
        })
        .catch((error: unknown) => {
          logger.error('createFailedDialog failed', { error });
        });
    }
  }

  public async initWikiGit(wikiFolderPath: string, isSyncedWiki?: boolean, isMainWiki?: boolean, remoteUrl?: string, userInfo?: IGitUserInfos): Promise<void> {
    const syncImmediately = !!isSyncedWiki && !!isMainWiki;
    const { worker, workspace } = await this.getWorkerForRepoPath(wikiFolderPath);
    await new Promise<void>((resolve, reject) => {
      worker
        .initWikiGit(wikiFolderPath, getErrorMessageI18NDict(), syncImmediately && net.isOnline(), remoteUrl, userInfo)
        .subscribe(this.getWorkerMessageObserver(wikiFolderPath, resolve, reject, workspace?.id));
    });
    // Log for e2e test detection - indicates initial git setup and commits are complete
    logger.info(`[test-id-git-init-complete]`, { wikiFolderPath });
  }

  public async initScopedWikiGit(repoPath: string, scopedPath: string): Promise<void> {
    const { worker } = await this.getWorkerForRepoPath(repoPath);
    await worker.initScopedWikiGit(repoPath, scopedPath);
    logger.info(`[test-id-git-init-complete]`, { wikiFolderPath: repoPath, scopedPath });
  }

  public async commitAndSync(workspace: IWorkspace, configs: ICommitAndSyncConfigs): Promise<boolean> {
    // Note: we no longer pre-check net.isOnline() here because it can return false even when
    // the user IS online (e.g. VPN, certain firewall configs, Electron quirks). The underlying
    // git operations will fail naturally with a user-visible error notification if there
    // really is no network, so the silent early-return was causing "sync has no reaction" bugs.
    if (!isWikiWorkspace(workspace)) {
      return false;
    }
    const workspaceIDToShowNotification = workspace.isSubWiki ? workspace.mainWikiID! : workspace.id;
    const workspaceID = workspace.id;
    if (workspace.hibernated) {
      logger.warn('commitAndSync skipped because workspace is hibernated', { workspaceID });
      return false;
    }
    let releaseLock: (() => void) | undefined;
    try {
      releaseLock = await this.acquireOperationLock(workspaceID);
      // Sub-wikis don't have their own wiki worker, so wikiOperationInServer would hang forever.
      // HTML wikis have no Node wiki worker either.
      if (!workspace.isSubWiki && !isHtmlWikiWorkspace(workspace)) {
        try {
          await this.updateGitInfoTiddler(workspace, configs.remoteUrl, configs.userInfo?.branch);
        } catch (error: unknown) {
          logger.error('updateGitInfoTiddler failed when commitAndSync', { error });
        }
      }

      // Generate AI commit message if not provided and settings allow
      let finalConfigs = configs;
      const gitScope = resolveWorkspaceGitScope(workspace);
      // Scoped workspaces (HTML wiki tracking a single file, or folder wiki tracking a subfolder of
      // an ancestor repo) commit/push against the outer repoPath and limit staging to managedRelativePath.
      const scopedRepoPath = gitScope?.repoPath;
      const scopedManagedPath = gitScope?.managedRelativePath;
      const isScoped = scopedRepoPath !== undefined && scopedManagedPath !== undefined;
      if (isScoped) {
        finalConfigs = { ...configs, dir: scopedRepoPath };
      }
      if (!configs.commitMessage) {
        logger.debug('No commit message provided, attempting to generate AI commit message');
        const { generateAICommitMessage } = await import('./aiCommitMessage');
        const source = configs.commitOnly ? 'backup' : 'sync';
        const aiFolderPath = gitScope?.repoPath ?? workspace.wikiFolderLocation;
        const aiCommitMessage = await generateAICommitMessage(aiFolderPath, source, gitScope?.managedRelativePath);
        if (aiCommitMessage) {
          finalConfigs = { ...configs, commitMessage: aiCommitMessage };
          logger.debug('Using AI-generated commit message', { commitMessage: aiCommitMessage, source });
        } else {
          // If AI generation fails or times out, use default message
          logger.debug('AI commit message generation returned undefined, using default message', { source });
          finalConfigs = { ...configs, commitMessage: i18n.t('LOG.CommitBackupMessage') };
        }
      } else {
        logger.debug('Commit message already provided, skipping AI generation', { commitMessage: configs.commitMessage });
      }

      if (isScoped) {
        const gitWorker = this.getWorker(workspace);
        const hasChanges = await gitWorker.commitScopedChanges(
          scopedRepoPath,
          scopedManagedPath,
          finalConfigs.commitMessage ?? i18n.t('LOG.CommitBackupMessage'),
        );
        if (!configs.commitOnly) {
          const observable = gitWorker.commitAndSyncWiki(
            workspace,
            { ...finalConfigs, dir: scopedRepoPath, commitOnly: false },
            getErrorMessageI18NDict(),
          );
          await this.getHasChangeHandler(observable, scopedRepoPath, workspaceIDToShowNotification);
        }
        const changeType = configs.commitOnly ? 'commit' : 'sync';
        this.notifyGitStateChange(workspace.wikiFolderLocation, changeType);
        logger.info(`[test-id-git-${changeType}-complete]`, { wikiFolderLocation: workspace.wikiFolderLocation });
        return hasChanges;
      }

      const observable = this.getWorker(workspace).commitAndSyncWiki(workspace, finalConfigs, getErrorMessageI18NDict());
      const hasChanges = await this.getHasChangeHandler(observable, workspace.wikiFolderLocation, workspaceIDToShowNotification);

      // Notify git state change
      const changeType = configs.commitOnly ? 'commit' : 'sync';
      this.notifyGitStateChange(workspace.wikiFolderLocation, changeType);
      // Log for e2e test detection
      logger.info(`[test-id-git-${changeType}-complete]`, { wikiFolderLocation: workspace.wikiFolderLocation });
      return hasChanges;
    } catch (error: unknown) {
      const error_ = error as Error;
      this.createFailedNotification(error_.message, workspaceIDToShowNotification);
      // Return false on sync failure - no successful changes were made
      return false;
    } finally {
      releaseLock?.();
    }
  }

  public async forcePull(workspace: IWorkspace, configs: IForcePullConfigs): Promise<boolean> {
    // Same reasoning as commitAndSync: let the underlying git operation surface a real error
    // rather than silently swallowing it when net.isOnline() gives a false negative.
    if (!isWikiWorkspace(workspace)) {
      return false;
    }
    const workspaceIDToShowNotification = workspace.isSubWiki ? workspace.mainWikiID! : workspace.id;
    const workspaceID = workspace.id;
    if (workspace.hibernated) {
      logger.warn('forcePull skipped because workspace is hibernated', { workspaceID });
      return false;
    }
    let releaseLock: (() => void) | undefined;
    try {
      releaseLock = await this.acquireOperationLock(workspaceID);
      const gitScope = resolveWorkspaceGitScope(workspace);
      const scopedRepoPath = gitScope?.repoPath;
      const scopedConfigs = gitScope?.managedRelativePath !== undefined && scopedRepoPath !== undefined ? { ...configs, dir: scopedRepoPath } : configs;
      const observable = this.getWorker(workspace).forcePullWiki(workspace, scopedConfigs, getErrorMessageI18NDict());
      const hasChanges = await this.getHasChangeHandler(observable, workspace.wikiFolderLocation, workspaceIDToShowNotification);
      // Notify git state change
      this.notifyGitStateChange(workspace.wikiFolderLocation, 'pull');
      return hasChanges;
    } catch (error: unknown) {
      const error_ = error as Error;
      this.createFailedNotification(error_.message, workspaceIDToShowNotification);
      return false;
    } finally {
      releaseLock?.();
    }
  }

  /**
   * Handle methods that checks if there is any change. Return a promise that resolves to a "hasChanges" boolean, resolve on the observable completes.
   * @param observable return by `this.gitWorker`'s methods.
   * @returns the `hasChanges` result.
   */
  private async getHasChangeHandler(
    observable: ReturnType<GitWorker['commitAndSyncWiki']> | undefined,
    wikiFolderPath: string,
    workspaceID?: string,
  ) {
    // return the `hasChanges` result.
    return await new Promise<boolean>((resolve, reject) => {
      if (!observable) {
        logger.warn('gitWorker.commitAndSyncWiki returned undefined - gitWorker may not be initialized', { wikiFolderPath });
        resolve(false);
        return;
      }

      let hasChanges = false;
      observable.subscribe({
        next: (messageObject: IGitLogMessage) => {
          // Log the message
          if (messageObject.level === 'error') {
            const errorMessage = messageObject.error.message;
            // if workspace exists, show notification in workspace, else use dialog instead
            if (workspaceID === undefined) {
              this.createFailedDialog(errorMessage, wikiFolderPath);
            } else {
              this.createFailedNotification(errorMessage, workspaceID);
            }
            // Reject the promise on error to prevent service restart
            reject(messageObject.error);
            return;
          }
          const { message, meta, level } = messageObject;
          if (typeof meta === 'object' && meta !== null && 'step' in meta) {
            this.popGitErrorNotificationToUser((meta as { step: GitStep }).step, message);
            // Check if this step indicates changes
            if (stepsAboutChange.includes((meta as { step: GitStep }).step)) {
              hasChanges = true;
            }
          }
          const operationLogger = workspaceID === undefined
            ? getLogger({ process: 'git-worker', scope: { kind: 'global' }, component: 'git-worker' })
            : getLogger(workspaceLogContext(workspaceID, undefined, 'git-worker'));
          operationLogger.log(level, translateMessage(message), meta);
        },
        error: (error) => {
          // this normally won't happen. And will become unhandled error. Because Observable error can't be catch, don't know why.
          reject(error as Error);
        },
        complete: () => {
          resolve(hasChanges);
        },
      });
    });
  }

  public async clone(remoteUrl: string, repoFolderPath: string, userInfo: IGitUserInfos): Promise<void> {
    if (!net.isOnline()) {
      return;
    }
    const worker = this.getWorker();
    await new Promise<void>((resolve, reject) => {
      worker.cloneWiki(repoFolderPath, remoteUrl, userInfo, getErrorMessageI18NDict()).subscribe(this.getWorkerMessageObserver(repoFolderPath, resolve, reject));
    });
  }

  public async syncOrForcePull(workspace: IWorkspace, configs: IForcePullConfigs & ICommitAndSyncConfigs): Promise<boolean> {
    if (!isWikiWorkspace(workspace)) {
      return false;
    }
    // if local is in readonly mode, any things that write to local (by accident) should be completely overwrite by remote.
    if (workspace.readOnlyMode) {
      return await this.forcePull(workspace, configs);
    } else {
      return await this.commitAndSync(workspace, configs);
    }
  }

  /**
   * Generic type-safe proxy method for git operations
   * Uses conditional types and mapped types to ensure complete type safety
   */
  public async callGitOp<K extends keyof typeof gitOperations>(
    method: K,
    ...arguments_: Parameters<typeof gitOperations[K]>
  ): Promise<Awaited<ReturnType<typeof gitOperations[K]>>> {
    const repoPath = typeof arguments_[0] === 'string' ? arguments_[0] : undefined;
    const { worker } = repoPath === undefined ? { worker: this.getWorker() } : await this.getWorkerForRepoPath(repoPath);
    const operation = worker[method];
    if (typeof operation !== 'function') {
      throw new Error(`gitOperations.${method} is not a function`);
    }
    // Type assertion through unknown is necessary here because TypeScript cannot verify
    // that the union type of all gitOperations functions matches the generic K constraint
    const inflightKey = `${method}:${JSON.stringify(arguments_)}`;
    const inflight = this.inflightCallGitOps.get(inflightKey);
    if (inflight !== undefined) {
      return await inflight as Awaited<ReturnType<typeof gitOperations[K]>>;
    }

    const promise = (operation as unknown as (...arguments__: Parameters<typeof gitOperations[K]>) => Promise<Awaited<ReturnType<typeof gitOperations[K]>>>)(...arguments_);
    this.inflightCallGitOps.set(inflightKey, promise);
    try {
      return await promise;
    } finally {
      if (this.inflightCallGitOps.get(inflightKey) === promise) {
        this.inflightCallGitOps.delete(inflightKey);
      }
    }
  }

  public async callGitOpForWorkspace<K extends keyof typeof gitOperations>(
    workspaceID: string,
    method: K,
    ...arguments_: Parameters<typeof gitOperations[K]>
  ): Promise<Awaited<ReturnType<typeof gitOperations[K]>>> {
    const workspace = await this.getWorkspaceByID(workspaceID);
    if (workspace === undefined) throw new Error(`Workspace ${workspaceID} not found for Git operation ${method}`);
    const operation = this.getWorker(workspace)[method];
    if (typeof operation !== 'function') throw new Error(`gitOperations.${method} is not a function`);
    return await (operation as unknown as (...parameters: Parameters<typeof gitOperations[K]>) => Promise<Awaited<ReturnType<typeof gitOperations[K]>>>)(...arguments_);
  }

  public async getGitLog(repoPath: string, options?: import('./interface').IGitLogOptions, workspaceID?: string): Promise<import('./interface').IGitLogResult> {
    return workspaceID === undefined
      ? this.callGitOp('getGitLog', repoPath, options ?? {})
      : this.callGitOpForWorkspace(workspaceID, 'getGitLog', repoPath, options ?? {});
  }

  public async getCommitFiles(repoPath: string, commitHash: string, scopedPath?: string, workspaceID?: string): Promise<import('./interface').IFileWithStatus[]> {
    return workspaceID === undefined
      ? this.callGitOp('getCommitFiles', repoPath, commitHash, scopedPath)
      : this.callGitOpForWorkspace(workspaceID, 'getCommitFiles', repoPath, commitHash, scopedPath);
  }

  public async getUnpushedCommitHashes(repoPath: string, remoteUrl?: string | null, workspaceID?: string): Promise<Set<string>> {
    return workspaceID === undefined
      ? this.callGitOp('getUnpushedCommitHashes', repoPath, remoteUrl ?? undefined)
      : this.callGitOpForWorkspace(workspaceID, 'getUnpushedCommitHashes', repoPath, remoteUrl ?? undefined);
  }

  public async checkoutCommit(workspace: IWorkspace, commitHash: string): Promise<void> {
    if (!isWikiWorkspace(workspace)) return;
    const repoPath = this.resolveRepoPath(workspace);
    await this.callGitOp('checkoutCommit', repoPath, commitHash);
    // Notify git state change
    this.notifyGitStateChange(workspace.wikiFolderLocation, 'checkout');
    // Log for e2e test detection
    logger.info(`[test-id-git-checkout-complete]`, { wikiFolderPath: workspace.wikiFolderLocation, commitHash });
  }

  public async revertCommit(workspace: IWorkspace, commitHash: string, commitMessage?: string): Promise<void> {
    if (!isWikiWorkspace(workspace)) return;
    const repoPath = this.resolveRepoPath(workspace);
    try {
      await this.callGitOp('revertCommit', repoPath, commitHash, commitMessage);
      // Notify git state change BEFORE logging test marker
      // This ensures the notification is sent before tests start waiting for UI refresh
      this.notifyGitStateChange(workspace.wikiFolderLocation, 'revert');
      // Log for e2e test detection - only log after notification is sent
      logger.info(`[test-id-git-revert-complete]`, { wikiFolderPath: workspace.wikiFolderLocation, commitHash });
    } catch (error) {
      logger.error('revertCommit failed', { error, wikiFolderPath: workspace.wikiFolderLocation, commitHash, commitMessage });
      throw error;
    }
  }

  public async amendCommitMessage(workspace: IWorkspace, newMessage: string): Promise<void> {
    if (!isWikiWorkspace(workspace)) return;
    const repoPath = this.resolveRepoPath(workspace);
    try {
      await this.callGitOp('amendCommitMessage', repoPath, newMessage);
      // Notify git state change (commit list and hashes may change)
      this.notifyGitStateChange(workspace.wikiFolderLocation, 'commit');
    } catch (error) {
      logger.error('amendCommitMessage failed', { error, wikiFolderPath: workspace.wikiFolderLocation, newMessage });
      throw error;
    }
  }

  public async undoCommit(workspace: IWorkspace, commitHash: string): Promise<void> {
    if (!isWikiWorkspace(workspace)) return;
    const repoPath = this.resolveRepoPath(workspace);
    try {
      await this.callGitOp('undoCommit', repoPath, commitHash);
      // Notify git state change
      this.notifyGitStateChange(workspace.wikiFolderLocation, 'undo');
    } catch (error) {
      logger.error('undoCommit failed', { error, wikiFolderPath: workspace.wikiFolderLocation, commitHash });
      throw error;
    }
  }

  /** Undo multiple commits sequentially (newest-first) and fire only one notification at the end. */
  public async undoCommits(workspace: IWorkspace, commitHashes: string[]): Promise<void> {
    if (!isWikiWorkspace(workspace)) return;
    const repoPath = this.resolveRepoPath(workspace);
    try {
      for (const hash of commitHashes) {
        await this.callGitOp('undoCommit', repoPath, hash);
        logger.info(`[test-id-git-undo-complete]`, { wikiFolderPath: workspace.wikiFolderLocation, commitHash: hash });
      }
      // One notification after all undos complete so git log refreshes only once.
      this.notifyGitStateChange(workspace.wikiFolderLocation, 'undo');
    } catch (error) {
      logger.error('undoCommits failed', { error, wikiFolderPath: workspace.wikiFolderLocation, commitHashes });
      throw error;
    }
  }

  public async discardFileChanges(workspace: IWorkspace, filePath: string): Promise<void> {
    if (!isWikiWorkspace(workspace)) return;
    const repoPath = this.resolveRepoPath(workspace);
    await this.callGitOp('discardFileChanges', repoPath, filePath);
    // Notify git state change
    this.notifyGitStateChange(workspace.wikiFolderLocation, 'discard');
  }

  public async addToGitignore(wikiFolderPath: string, pattern: string): Promise<void> {
    await this.callGitOp('addToGitignore', wikiFolderPath, pattern);
    // Notify git state change to refresh git log
    this.notifyGitStateChange(wikiFolderPath, 'file-change');
  }

  public async isAIGenerateBackupTitleEnabled(): Promise<boolean> {
    try {
      const preferences = this.preferenceService.getPreferences();
      if (!preferences.aiGenerateBackupTitle) {
        return false;
      }

      const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
      return await externalAPIService.isAIAvailable();
    } catch {
      return false;
    }
  }
}
