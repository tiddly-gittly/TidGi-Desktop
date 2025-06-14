import { dialog, net } from 'electron';
import { getRemoteName, getRemoteUrl, GitStep, ModifiedFileList, stepsAboutChange } from 'git-sync-js';
import { inject, injectable } from 'inversify';
import { Observer } from 'rxjs';
import { ModuleThread, spawn, Worker } from 'threads';

// @ts-expect-error it don't want .ts

import workerURL from 'threads-plugin/dist/loader?name=gitWorker!./gitWorker.ts';

import { LOCAL_GIT_DIRECTORY } from '@/constants/appPaths';
import { WikiChannel } from '@/constants/channels';
import type { IAuthenticationService, ServiceBranchTypes } from '@services/auth/interface';
import { lazyInject } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkspace, isWikiWorkspace } from '@services/workspaces/interface';
import { ObservablePromise } from 'node_modules/threads/dist/observable-promise';
import { GitWorker } from './gitWorker';
import { ICommitAndSyncConfigs, IForcePullConfigs, IGitLogMessage, IGitService, IGitUserInfos } from './interface';
import { getErrorMessageI18NDict, translateMessage } from './translateMessage';

@injectable()
export class Git implements IGitService {
  @lazyInject(serviceIdentifier.Authentication)
  private readonly authService!: IAuthenticationService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.View)
  private readonly viewService!: IViewService;

  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  private gitWorker?: ModuleThread<GitWorker>;

  constructor(@inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService) {
    void this.initWorker();
  }

  private async initWorker(): Promise<void> {
    process.env.LOCAL_GIT_DIRECTORY = LOCAL_GIT_DIRECTORY;
    logger.debug(`initial gitWorker with  ${workerURL as string}`, { function: 'Git.initWorker', LOCAL_GIT_DIRECTORY });
    this.gitWorker = await spawn<GitWorker>(new Worker(workerURL as string), { timeout: 1000 * 60 });
    logger.debug(`initial gitWorker done`, { function: 'Git.initWorker' });
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
    const browserView = this.viewService.getView(workspace.id, WindowNames.main);
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
    if (await this.wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspace.id, ['$:/GitHub/Repo']) !== githubRepoName) {
      await this.wikiService.wikiOperationInBrowser(WikiChannel.addTiddler, workspace.id, ['$:/GitHub/Repo', githubRepoName]);
    }
    if (await this.wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspace.id, ['$:/GitHub/Branch']) !== branch) {
      await this.wikiService.wikiOperationInBrowser(WikiChannel.addTiddler, workspace.id, ['$:/GitHub/Branch', branch]);
    }
  }

  private popGitErrorNotificationToUser(step: GitStep, message: string): void {
    if (step === GitStep.GitPushFailed && message.includes('403')) {
      const mainWindow = this.windowService.get(WindowNames.main);
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
        // if workspace exists, show notification in workspace, else use dialog instead
        if (workspaceID === undefined) {
          this.createFailedDialog((messageObject.error).message, wikiFolderPath);
        } else {
          this.createFailedNotification((messageObject.error).message, workspaceID);
        }
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
    void this.wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, workspaceID, [`${i18n.t('Log.SynchronizationFailed')} ${message}`]);
  }

  private createFailedDialog(message: string, wikiFolderPath: string): void {
    const mainWindow = this.windowService.get(WindowNames.main);
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
        .catch((error) => logger.error('createFailedDialog failed', error));
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
    if (!net.isOnline()) {
      // If not online, will not have any change
      return false;
    }
    if (!isWikiWorkspace(workspace)) {
      return false;
    }
    const workspaceIDToShowNotification = workspace.isSubWiki ? workspace.mainWikiID! : workspace.id;
    try {
      try {
        await this.updateGitInfoTiddler(workspace, configs.remoteUrl, configs.userInfo?.branch);
      } catch (error) {
        logger.error('updateGitInfoTiddler failed when commitAndSync', error);
      }
      const observable = this.gitWorker?.commitAndSyncWiki(workspace, configs, getErrorMessageI18NDict());
      return await this.getHasChangeHandler(observable, workspace.wikiFolderLocation, workspaceIDToShowNotification);
    } catch (error) {
      this.createFailedNotification((error as Error).message, workspaceIDToShowNotification);
      return true;
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
    return await this.getHasChangeHandler(observable, workspace.wikiFolderLocation, workspaceIDToShowNotification);
  }

  /**
   * Handle methods that checks if there is any change. Return a promise that resolves to a "hasChanges" boolean, resolve on the observable completes.
   * @param observable return by `this.gitWorker`'s methods.
   * @returns the `hasChanges` result.
   */
  private async getHasChangeHandler(observable: ObservablePromise<IGitLogMessage> | undefined, wikiFolderPath: string, workspaceID?: string) {
    // return the `hasChanges` result.
    return await new Promise<boolean>((resolve, reject) => {
      observable?.subscribe(this.getWorkerMessageObserver(wikiFolderPath, () => {}, reject, workspaceID));
      let hasChanges = false;
      observable?.subscribe({
        next: (messageObject) => {
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
      return true;
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
}
