import { createWorkerProxy } from '@services/libs/workerAdapter';
import { dialog, net } from 'electron';
import { getRemoteName, getRemoteUrl, GitStep, ModifiedFileList, stepsAboutChange } from 'git-sync-js';
import { inject, injectable } from 'inversify';
import { BehaviorSubject, Observer } from 'rxjs';
import { Worker } from 'worker_threads';
// @ts-expect-error - Vite worker import with ?nodeWorker query
import GitWorkerFactory from './gitWorker?nodeWorker';

import { LOCAL_GIT_DIRECTORY } from '@/constants/appPaths';
import { WikiChannel } from '@/constants/channels';
import type { IAuthenticationService, ServiceBranchTypes } from '@services/auth/interface';
import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { isWikiWorkspace, type IWorkspace } from '@services/workspaces/interface';
import * as gitOperations from './gitOperations';
import type { GitWorker } from './gitWorker';
import type { ICommitAndSyncConfigs, IForcePullConfigs, IGitLogMessage, IGitLogOptions, IGitLogResult, IGitService, IGitStateChange, IGitUserInfos } from './interface';
import { registerMenu } from './registerMenu';
import { getErrorMessageI18NDict, translateMessage } from './translateMessage';

@injectable()
export class Git implements IGitService {
  private gitWorker?: GitWorker;
  private nativeWorker?: Worker;
  public gitStateChange$ = new BehaviorSubject<IGitStateChange | undefined>(undefined);

  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.NativeService) private readonly nativeService: INativeService,
  ) {}

  private notifyGitStateChange(wikiFolderLocation: string, type: IGitStateChange['type']): void {
    this.gitStateChange$.next({
      timestamp: Date.now(),
      wikiFolderLocation,
      type,
    });
  }

  public async initialize(): Promise<void> {
    await this.initWorker();
    // Register menu items after initialization
    void registerMenu();
  }

  private async initWorker(): Promise<void> {
    process.env.LOCAL_GIT_DIRECTORY = LOCAL_GIT_DIRECTORY;

    logger.debug(`Initializing gitWorker`, {
      function: 'Git.initWorker',
      LOCAL_GIT_DIRECTORY,
    });

    try {
      // Use Vite's ?nodeWorker import instead of dynamic Worker path
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const worker = GitWorkerFactory() as Worker;
      this.nativeWorker = worker;
      this.gitWorker = createWorkerProxy<GitWorker>(worker);
      logger.debug('gitWorker initialized successfully', { function: 'Git.initWorker' });
    } catch (error) {
      logger.error('Failed to initialize gitWorker', {
        function: 'Git.initWorker',
        error,
      });
      throw error;
    }
  }

  public async getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]> {
    const list = await this.gitWorker?.getModifiedFileList(wikiFolderPath);
    return list ?? [];
  }

  public async getWorkspacesRemote(wikiFolderPath?: string): Promise<string | undefined> {
    if (!wikiFolderPath) return;
    const branch = (await this.authService.get('git-branch' as ServiceBranchTypes)) ?? 'main';
    const defaultRemoteName = (await getRemoteName(wikiFolderPath, branch)) ?? 'origin';
    const remoteUrl = await getRemoteUrl(wikiFolderPath, defaultRemoteName);
    return remoteUrl;
  }

  /**
   * Update in-wiki settings for git. Only needed if the wiki is config to synced.
   * @param {string} remoteUrl
   */
  private async updateGitInfoTiddler(workspace: IWorkspace, remoteUrl?: string, branch?: string): Promise<void> {
    // at least 'http://', but in some case it might be shorter, like 'a.b'
    if (remoteUrl === undefined || remoteUrl.length < 3) return;
    if (branch === undefined) return;
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const browserView = viewService.getView(workspace.id, WindowNames.main);
    if (browserView === undefined) {
      logger.error(`no browserView in updateGitInfoTiddler for ID ${workspace.id}`);
      return;
    }
    // "/tiddly-gittly/TidGi-Desktop/issues/370"
    const { pathname } = new URL(remoteUrl);
    // [ "", "tiddly-gittly", "TidGi-Desktop", "issues", "370" ]
    const [, userName, repoName] = pathname.split('/');
    /**
     * similar to "linonetwo/wiki", string after "https://com/"
     */
    const githubRepoName = `${userName}/${repoName}`;
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    if (await wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspace.id, ['$:/GitHub/Repo']) !== githubRepoName) {
      await wikiService.wikiOperationInBrowser(WikiChannel.addTiddler, workspace.id, ['$:/GitHub/Repo', githubRepoName]);
    }
    if (await wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspace.id, ['$:/GitHub/Branch']) !== branch) {
      await wikiService.wikiOperationInBrowser(WikiChannel.addTiddler, workspace.id, ['$:/GitHub/Branch', branch]);
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
        const errorMessage = (messageObject.error).message;
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
      }
      logger.log(level, translateMessage(message), meta);
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
    await new Promise<void>((resolve, reject) => {
      this.gitWorker
        ?.initWikiGit(wikiFolderPath, getErrorMessageI18NDict(), syncImmediately && net.isOnline(), remoteUrl, userInfo)
        .subscribe(this.getWorkerMessageObserver(wikiFolderPath, resolve, reject));
    });
  }

  public async commitAndSync(workspace: IWorkspace, configs: ICommitAndSyncConfigs): Promise<boolean> {
    // For commit-only operations (local workspace), we don't need network
    // Only check network for sync operations
    if (!configs.commitOnly && !net.isOnline()) {
      // If not online and trying to sync, will not have any change
      return false;
    }
    if (!isWikiWorkspace(workspace)) {
      return false;
    }
    const workspaceIDToShowNotification = workspace.isSubWiki ? workspace.mainWikiID! : workspace.id;
    try {
      try {
        await this.updateGitInfoTiddler(workspace, configs.remoteUrl, configs.userInfo?.branch);
      } catch (error: unknown) {
        logger.error('updateGitInfoTiddler failed when commitAndSync', { error });
      }

      // Generate AI commit message if not provided and settings allow
      let finalConfigs = configs;
      if (!configs.commitMessage) {
        logger.info('No commit message provided, attempting to generate AI commit message');
        const { generateAICommitMessage } = await import('./aiCommitMessage');
        const aiCommitMessage = await generateAICommitMessage(workspace.wikiFolderLocation);
        if (aiCommitMessage) {
          finalConfigs = { ...configs, commitMessage: aiCommitMessage };
          logger.info('Using AI-generated commit message', { commitMessage: aiCommitMessage });
        } else {
          // If AI generation fails or times out, use default message
          logger.info('AI commit message generation returned undefined, using default message');
          finalConfigs = { ...configs, commitMessage: i18n.t('LOG.CommitBackupMessage') };
        }
      } else {
        logger.info('Commit message already provided, skipping AI generation', { commitMessage: configs.commitMessage });
      }

      const observable = this.gitWorker?.commitAndSyncWiki(workspace, finalConfigs, getErrorMessageI18NDict());
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
    }
  }

  public async forcePull(workspace: IWorkspace, configs: IForcePullConfigs): Promise<boolean> {
    if (!net.isOnline()) {
      return false;
    }
    if (!isWikiWorkspace(workspace)) {
      return false;
    }
    const workspaceIDToShowNotification = workspace.isSubWiki ? workspace.mainWikiID! : workspace.id;
    const observable = this.gitWorker?.forcePullWiki(workspace, configs, getErrorMessageI18NDict());
    const hasChanges = await this.getHasChangeHandler(observable, workspace.wikiFolderLocation, workspaceIDToShowNotification);
    // Notify git state change
    this.notifyGitStateChange(workspace.wikiFolderLocation, 'pull');
    return hasChanges;
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
        resolve(false);
        return;
      }

      observable.subscribe(this.getWorkerMessageObserver(wikiFolderPath, () => {}, reject, workspaceID));
      let hasChanges = false;
      observable.subscribe({
        next: (messageObject: IGitLogMessage) => {
          if (messageObject.level === 'error') {
            return;
          }
          const { meta } = messageObject;
          if (typeof meta === 'object' && meta !== null && 'step' in meta && stepsAboutChange.includes((meta as { step: GitStep }).step)) {
            hasChanges = true;
          }
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
    await new Promise<void>((resolve, reject) => {
      this.gitWorker?.cloneWiki(repoFolderPath, remoteUrl, userInfo, getErrorMessageI18NDict()).subscribe(this.getWorkerMessageObserver(repoFolderPath, resolve, reject));
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

  public async getGitLog(wikiFolderPath: string, options?: IGitLogOptions): Promise<IGitLogResult> {
    return await gitOperations.getGitLog(wikiFolderPath, options);
  }

  public async getCommitFiles(wikiFolderPath: string, commitHash: string): Promise<string[]> {
    return await gitOperations.getCommitFiles(wikiFolderPath, commitHash);
  }

  public async getFileDiff(wikiFolderPath: string, commitHash: string, filePath: string, maxLines?: number, maxChars?: number): Promise<import('./interface').IFileDiffResult> {
    return await gitOperations.getFileDiff(wikiFolderPath, commitHash, filePath, maxLines, maxChars);
  }

  public async getFileContent(wikiFolderPath: string, commitHash: string, filePath: string, maxLines?: number, maxChars?: number): Promise<import('./interface').IFileDiffResult> {
    return await gitOperations.getFileContent(wikiFolderPath, commitHash, filePath, maxLines, maxChars);
  }

  public async getFileBinaryContent(wikiFolderPath: string, commitHash: string, filePath: string): Promise<string> {
    return await gitOperations.getFileBinaryContent(wikiFolderPath, commitHash, filePath);
  }

  public async getImageComparison(wikiFolderPath: string, commitHash: string, filePath: string): Promise<{ previous: string | null; current: string | null }> {
    return await gitOperations.getImageComparison(wikiFolderPath, commitHash, filePath);
  }

  public async checkoutCommit(wikiFolderPath: string, commitHash: string): Promise<void> {
    await gitOperations.checkoutCommit(wikiFolderPath, commitHash);
    // Notify git state change
    this.notifyGitStateChange(wikiFolderPath, 'checkout');
    // Log for e2e test detection
    logger.info(`[test-id-git-checkout-complete]`, { wikiFolderPath, commitHash });
  }

  public async revertCommit(wikiFolderPath: string, commitHash: string, commitMessage?: string): Promise<void> {
    try {
      await gitOperations.revertCommit(wikiFolderPath, commitHash, commitMessage);
      // Notify git state change
      this.notifyGitStateChange(wikiFolderPath, 'revert');
      // Log for e2e test detection
      logger.info(`[test-id-git-revert-complete]`, { wikiFolderPath, commitHash });
    } catch (error) {
      logger.error('revertCommit failed', { error, wikiFolderPath, commitHash, commitMessage });
      throw error;
    }
  }

  public async discardFileChanges(wikiFolderPath: string, filePath: string): Promise<void> {
    await gitOperations.discardFileChanges(wikiFolderPath, filePath);
    // Notify git state change
    this.notifyGitStateChange(wikiFolderPath, 'discard');
  }

  public async addToGitignore(wikiFolderPath: string, pattern: string): Promise<void> {
    await gitOperations.addToGitignore(wikiFolderPath, pattern);
  }

  public async isAIGenerateBackupTitleEnabled(): Promise<boolean> {
    try {
      const preferences = this.preferenceService.getPreferences();
      if (!preferences.aiGenerateBackupTitle) {
        return false;
      }

      const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
      const aiConfig = await externalAPIService.getAIConfig();

      return !!(aiConfig?.api?.freeModel && aiConfig?.api?.provider);
    } catch {
      return false;
    }
  }
}
