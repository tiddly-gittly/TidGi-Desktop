/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { delay } from 'bluebird';
import { BrowserView, dialog, ipcMain, shell } from 'electron';
import fs from 'fs-extra';
import { injectable } from 'inversify';
import path from 'path';
import { ModuleThread, spawn, Thread, Worker } from 'threads';
import type { WorkerEvent } from 'threads/dist/types/master';

import { WikiChannel } from '@/constants/channels';
import { TIDDLERS_PATH, TIDDLYWIKI_PACKAGE_FOLDER, TIDDLYWIKI_TEMPLATE_FOLDER_PATH } from '@/constants/paths';
import type { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { getWikiLogFilePath, logger, refreshOutputFile, wikiOutputToFile } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IViewService } from '@services/view/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { CopyWikiTemplateError, DoubleWikiInstanceError, SubWikiSMainWikiNotExistError, WikiRuntimeError } from './error';
import { IWikiService, WikiControlActions } from './interface';
import { getSubWikiPluginContent, ISubWikiPluginContent, updateSubWikiPluginContent } from './plugin/subWikiPlugin';
import type { WikiWorker } from './wikiWorker';

import { defaultServerIP } from '@/constants/urls';
import { IPreferenceService } from '@services/preferences/interface';
// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=wikiWorker!./wikiWorker.ts';
import { IWikiOperations, wikiOperations } from './wikiOperations';

@injectable()
export class Wiki implements IWikiService {
  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.Authentication)
  private readonly authService!: IAuthenticationService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.Git)
  private readonly gitService!: IGitService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  @lazyInject(serviceIdentifier.View)
  private readonly viewService!: IViewService;

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  public async getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]> {
    return await getSubWikiPluginContent(mainWikiPath);
  }

  public async requestWikiSendActionMessage(actionMessage: string): Promise<void> {
    const browserViews = await this.viewService.getActiveBrowserViews();
    browserViews.forEach((browserView) => {
      if (browserView !== undefined) {
        browserView.webContents.send(WikiChannel.sendActionMessage, actionMessage);
      }
    });
  }

  // handlers
  public async copyWikiTemplate(newFolderPath: string, folderName: string): Promise<void> {
    try {
      await this.createWiki(newFolderPath, folderName);
    } catch (error) {
      throw new CopyWikiTemplateError(`${(error as Error).message}, (${newFolderPath}, ${folderName})`);
    }
  }

  // key is same to workspace wikiFolderLocation, so we can get this worker by workspace wikiFolderLocation
  // { [wikiFolderLocation: string]: ArbitraryThreadType }
  private wikiWorkers: Partial<Record<string, ModuleThread<WikiWorker>>> = {};
  public getWorker(wikiFolderLocation: string): ModuleThread<WikiWorker> | undefined {
    return this.wikiWorkers[wikiFolderLocation];
  }

  public async startWiki(wikiFolderLocation: string, tiddlyWikiPort: number, userName: string): Promise<void> {
    if (this.getWorker(wikiFolderLocation) !== undefined) {
      throw new DoubleWikiInstanceError(wikiFolderLocation);
    }
    // use Promise to handle worker callbacks
    const workspace = await this.workspaceService.getByWikiFolderLocation(wikiFolderLocation);
    const workspaceID = workspace?.id;
    if (workspace === undefined || workspaceID === undefined) {
      logger.error('Try to start wiki, but workspace not found', { homePath: wikiFolderLocation, workspace, workspaceID });
      return;
    }
    // wiki server is about to boot, but our webview is just start loading, wait for `view.webContents.on('did-stop-loading'` to set this to false
    await this.workspaceService.updateMetaData(workspaceID, { isLoading: true });
    const workerData = {
      homePath: wikiFolderLocation,
      userName,
      tiddlyWikiPort,
      rootTiddler: workspace.rootTiddler,
      tiddlyWikiHost: defaultServerIP,
      constants: { TIDDLYWIKI_PACKAGE_FOLDER },
    };
    const worker = await spawn<WikiWorker>(new Worker(workerURL as string), { timeout: 1000 * 60 });
    this.wikiWorkers[wikiFolderLocation] = worker;
    refreshOutputFile(wikiFolderLocation);
    const loggerMeta = { worker: 'NodeJSWiki', homePath: wikiFolderLocation };
    await new Promise<void>((resolve, reject) => {
      // handle native messages
      Thread.errors(worker).subscribe(async (error) => {
        logger.error(error.message, { ...loggerMeta, ...error });
        wikiOutputToFile(wikiFolderLocation, error.message);
        reject(new WikiRuntimeError(error, wikiFolderLocation, false));
      });
      Thread.events(worker).subscribe((event: WorkerEvent) => {
        if (event.type === 'message') {
          const messageString = JSON.stringify(event.data);
          wikiOutputToFile(wikiFolderLocation, `${messageString}\n`);
          logger.debug('wiki message', { ...event.data, ...loggerMeta });
        } else if (event.type === 'termination') {
          delete this.wikiWorkers[wikiFolderLocation];
          const warningMessage = `NodeJSWiki ${wikiFolderLocation} Worker stopped (can be normal quit, or unexpected error, see other logs to determine)`;
          logger.info(warningMessage, loggerMeta);
          logger.info(`startWiki() rejected with message.type === 'message' and event.type === 'termination'`, loggerMeta);
          resolve();
        }
      });

      // subscribe to the Observable that startNodeJSWiki returns, handle messages send by our code
      worker.startNodeJSWiki(workerData).subscribe(async (message) => {
        if (message.type === 'control') {
          switch (message.actions) {
            case WikiControlActions.booted: {
              setTimeout(async () => {
                if (message.message !== undefined) {
                  logger.info('WikiControlActions.booted', { 'message.message': message.message, ...loggerMeta });
                }
                logger.info(`startWiki() resolved with message.type === 'control' and WikiControlActions.booted`, loggerMeta);
                resolve();
              }, 100);
              break;
            }
            case WikiControlActions.start: {
              if (message.message !== undefined) {
                logger.debug('WikiControlActions.start', { 'message.message': message.message, ...loggerMeta });
              }
              break;
            }
            case WikiControlActions.error: {
              const errorMessage = message.message ?? 'get WikiControlActions.error without message';
              logger.error(errorMessage, { ...loggerMeta, message });
              logger.info(`startWiki() rejected with message.type === 'control' and  WikiControlActions.error`, loggerMeta);
              await this.workspaceService.updateMetaData(workspaceID, { isLoading: false, didFailLoadErrorMessage: errorMessage });
              // fix "message":"listen EADDRINUSE: address already in use 0.0.0.0:5212"
              if (errorMessage.includes('EADDRINUSE')) {
                const portChange = {
                  port: tiddlyWikiPort + 1,
                  homeUrl: workspace.homeUrl.replace(`:${tiddlyWikiPort}`, `:${tiddlyWikiPort + 1}`),
                  // eslint-disable-next-line unicorn/no-null
                  lastUrl: workspace.lastUrl?.replace?.(`:${tiddlyWikiPort}`, `:${tiddlyWikiPort + 1}`) ?? null,
                };
                await this.workspaceService.update(workspaceID, portChange, true);
                reject(new WikiRuntimeError(new Error(message.message), wikiFolderLocation, true, { ...workspace, ...portChange }));
                return;
              }
              reject(new WikiRuntimeError(new Error(message.message), wikiFolderLocation, false));
            }
          }
        } else if (message.type === 'stderr' || message.type === 'stdout') {
          wikiOutputToFile(wikiFolderLocation, message.message);
        }
      });
    });
  }

  public async extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string): Promise<boolean | string> {
    // hope saveWikiFolderPath = ParentFolderPath + wikifolderPath
    // We want the folder where the WIKI is saved to be empty, and we want the input htmlWiki to be an HTML file even if it is a non-wikiHTML file. Otherwise the program will exit abnormally.
    const worker = await spawn<WikiWorker>(new Worker(workerURL as string), { timeout: 1000 * 60 });
    let result: boolean | string = false;
    try {
      result = await worker.extractWikiHTML(htmlWikiPath, saveWikiFolderPath);
    } catch (error) {
      result = (error as Error).message;
      logger.error(result, { worker: 'NodeJSWiki', method: 'extractWikiHTML', htmlWikiPath, saveWikiFolderPath });
      // removes the folder function that failed to convert.
      try {
        await fs.remove(saveWikiFolderPath);
      } catch {}
    }
    // this worker is only for one time use. we will spawn a new one for starting wiki later.
    await Thread.terminate(worker);
    return result;
  }

  public async packetHTMLFromWikiFolder(folderWikiPath: string, saveWikiHtmlFolder: string): Promise<void> {
    const worker = await spawn<WikiWorker>(new Worker(workerURL as string), { timeout: 1000 * 60 });
    await worker.packetHTMLFromWikiFolder(folderWikiPath, saveWikiHtmlFolder);
    // this worker is only for one time use. we will spawn a new one for starting wiki later.
    await Thread.terminate(worker);
  }

  public async stopWiki(wikiFolderLocation: string): Promise<void> {
    const worker = this.getWorker(wikiFolderLocation);
    if (worker === undefined) {
      logger.warning(`No wiki for ${wikiFolderLocation}. No running worker, means maybe tiddlywiki server in this workspace failed to start`, {
        function: 'stopWiki',
      });
      await Promise.resolve();
      return;
    }
    clearInterval(this.wikiSyncIntervals[wikiFolderLocation]);
    try {
      logger.debug(`worker.beforeExit for ${wikiFolderLocation}`);
      await worker.beforeExit();
      logger.debug(`Thread.terminate for ${wikiFolderLocation}`);
      await Thread.terminate(worker);
      // await delay(100);
    } catch (error) {
      logger.error(`Wiki-worker have error ${(error as Error).message} when try to stop`, { function: 'stopWiki' });
      // await worker.terminate();
    }
    (this.wikiWorkers[wikiFolderLocation] as any) = undefined;
    logger.info(`Wiki-worker for ${wikiFolderLocation} stopped`, { function: 'stopWiki' });
  }

  /**
   * Stop all worker_thread, use and await this before app.quit()
   */
  public async stopAllWiki(): Promise<void> {
    logger.debug('stopAllWiki()', { function: 'stopAllWiki' });
    const tasks = [];
    for (const homePath of Object.keys(this.wikiWorkers)) {
      tasks.push(this.stopWiki(homePath));
    }
    await Promise.all(tasks);
    logger.info('All wiki workers are stopped', { function: 'stopAllWiki' });
  }

  /**
   * Send message to UI via WikiChannel.createProgress
   * @param message will show in the UI
   */
  private readonly logProgress = (message: string): void => {
    logger.notice(message, { handler: WikiChannel.createProgress });
  };

  private readonly folderToContainSymlinks = 'subwiki';
  /**
   * Link a sub wiki to a main wiki, this will create a shortcut folder from main wiki to sub wiki, so when saving files to that shortcut folder, you will actually save file to the sub wiki
   * We place symbol-link (short-cuts) in the tiddlers/subwiki/ folder, and ignore this folder in the .gitignore, so this symlink won't be commit to the git, as it contains computer specific path.
   * @param {string} mainWikiPath folderPath of a wiki as link's destination
   * @param {string} folderName sub-wiki's folder name
   * @param {string} newWikiPath sub-wiki's folder path
   */
  public async linkWiki(mainWikiPath: string, folderName: string, subWikiPath: string): Promise<void> {
    const mainWikiTiddlersFolderSubWikisPath = path.join(mainWikiPath, TIDDLERS_PATH, this.folderToContainSymlinks);
    const subwikiSymlinkPath = path.join(mainWikiTiddlersFolderSubWikisPath, folderName);
    try {
      try {
        await fs.remove(subwikiSymlinkPath);
      } catch {}
      await fs.mkdirp(mainWikiTiddlersFolderSubWikisPath);
      await fs.createSymlink(subWikiPath, subwikiSymlinkPath, 'junction');
      this.logProgress(i18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiSucceed'));
    } catch (error: unknown) {
      throw new Error(i18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiFailed', { subWikiPath, mainWikiTiddlersFolderPath: subwikiSymlinkPath, error }));
    }
  }

  private async createWiki(newFolderPath: string, folderName: string): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartUsingTemplateToCreateWiki'));
    const newWikiPath = path.join(newFolderPath, folderName);
    if (!(await fs.pathExists(newFolderPath))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath }));
    }
    if (!(await fs.pathExists(TIDDLYWIKI_TEMPLATE_FOLDER_PATH))) {
      throw new Error(i18n.t('AddWorkspace.WikiTemplateMissing', { TIDDLYWIKI_TEMPLATE_FOLDER_PATH }));
    }
    if (await fs.pathExists(newWikiPath)) {
      throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
    }
    try {
      await fs.copy(TIDDLYWIKI_TEMPLATE_FOLDER_PATH, newWikiPath, {
        filter: (source: string, destination: string) => {
          // xxx/template/wiki/.gitignore
          // xxx/template/wiki/.github
          // xxx/template/wiki/.git
          // prevent copy git submodule's .git folder
          if (source.endsWith('.git')) {
            return false;
          }
          // it will be copied if return true
          return true;
        },
      });
    } catch {
      throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
    }
    this.logProgress(i18n.t('AddWorkspace.WikiTemplateCopyCompleted') + newWikiPath);
  }

  public async createSubWiki(parentFolderLocation: string, folderName: string, mainWikiPath: string, tagName = '', onlyLink = false): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartCreatingSubWiki'));
    const newWikiPath = path.join(parentFolderLocation, folderName);
    if (!(await fs.pathExists(parentFolderLocation))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { parentFolderLocation }));
    }
    if (!onlyLink) {
      if (await fs.pathExists(newWikiPath)) {
        throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
      }
      try {
        await fs.mkdirs(newWikiPath);
      } catch {
        throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
      }
    }
    this.logProgress(i18n.t('AddWorkspace.StartLinkingSubWikiToMainWiki'));
    await this.linkWiki(mainWikiPath, folderName, newWikiPath);
    if (typeof tagName === 'string' && tagName.length > 0) {
      this.logProgress(i18n.t('AddWorkspace.AddFileSystemPath'));
      updateSubWikiPluginContent(mainWikiPath, { tagName, subWikiFolderName: folderName });
    }

    this.logProgress(i18n.t('AddWorkspace.SubWikiCreationCompleted'));
  }

  public async removeWiki(wikiPath: string, mainWikiToUnLink?: string, onlyRemoveLink = false): Promise<void> {
    if (mainWikiToUnLink !== undefined) {
      const subWikiName = path.basename(wikiPath);
      await fs.remove(path.join(mainWikiToUnLink, TIDDLERS_PATH, this.folderToContainSymlinks, subWikiName));
    }
    if (!onlyRemoveLink) {
      await fs.remove(wikiPath);
    }
  }

  public async ensureWikiExist(wikiPath: string, shouldBeMainWiki: boolean): Promise<void> {
    if (!(await fs.pathExists(wikiPath))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath: wikiPath }));
    }
    const wikiInfoPath = path.resolve(wikiPath, 'tiddlywiki.info');
    if (shouldBeMainWiki && !(await fs.pathExists(wikiInfoPath))) {
      throw new Error(i18n.t('AddWorkspace.ThisPathIsNotAWikiFolder', { wikiPath, wikiInfoPath }));
    }
    if (shouldBeMainWiki && !(await fs.pathExists(path.join(wikiPath, TIDDLERS_PATH)))) {
      throw new Error(i18n.t('AddWorkspace.ThisPathIsNotAWikiFolder', { wikiPath }));
    }
  }

  public async checkWikiExist(workspace: IWorkspace, options: { shouldBeMainWiki?: boolean; showDialog?: boolean } = {}): Promise<string | true> {
    const { wikiFolderLocation, id: workspaceID } = workspace;
    const { shouldBeMainWiki, showDialog } = options;
    try {
      if (typeof wikiFolderLocation !== 'string' || wikiFolderLocation.length === 0 || !path.isAbsolute(wikiFolderLocation)) {
        const errorMessage = i18n.t('Dialog.NeedCorrectTiddlywikiFolderPath') + wikiFolderLocation;
        logger.error(errorMessage);
        const mainWindow = this.windowService.get(WindowNames.main);
        if (mainWindow !== undefined && showDialog === true) {
          await dialog.showMessageBox(mainWindow, {
            title: i18n.t('Dialog.PathPassInCantUse'),
            message: errorMessage,
            buttons: ['OK'],
            cancelId: 0,
            defaultId: 0,
          });
        }
        return errorMessage;
      }
      await this.ensureWikiExist(wikiFolderLocation, shouldBeMainWiki ?? false);
      return true;
    } catch (error) {
      const checkResult = (error as Error).message;

      const errorMessage = `${i18n.t('Dialog.CantFindWorkspaceFolderRemoveWorkspace')} ${wikiFolderLocation} ${checkResult}`;
      logger.error(errorMessage);
      const mainWindow = this.windowService.get(WindowNames.main);
      if (mainWindow !== undefined && showDialog === true) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          title: i18n.t('Dialog.WorkspaceFolderRemoved'),
          message: errorMessage,
          buttons: [i18n.t('Dialog.RemoveWorkspace'), i18n.t('Dialog.DoNotCare')],
          cancelId: 1,
          defaultId: 0,
        });
        if (response === 0) {
          await this.workspaceViewService.removeWorkspaceView(workspaceID);
        }
      }
      return errorMessage;
    }
  }

  public async cloneWiki(parentFolderLocation: string, wikiFolderName: string, gitRepoUrl: string, gitUserInfo: IGitUserInfos): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartCloningWiki'));
    const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
    if (!(await fs.pathExists(parentFolderLocation))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath: parentFolderLocation }));
    }
    if (await fs.pathExists(newWikiPath)) {
      throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
    }
    try {
      await fs.mkdir(newWikiPath);
    } catch {
      throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
    }
    await this.gitService.clone(gitRepoUrl, path.join(parentFolderLocation, wikiFolderName), gitUserInfo);
  }

  public async cloneSubWiki(
    parentFolderLocation: string,
    wikiFolderName: string,
    mainWikiPath: string,
    gitRepoUrl: string,
    gitUserInfo: IGitUserInfos,
    tagName = '',
  ): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartCloningSubWiki'));
    const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
    if (!(await fs.pathExists(parentFolderLocation))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath: parentFolderLocation }));
    }
    if (await fs.pathExists(newWikiPath)) {
      throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
    }
    try {
      await fs.mkdir(newWikiPath);
    } catch {
      throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
    }
    await this.gitService.clone(gitRepoUrl, path.join(parentFolderLocation, wikiFolderName), gitUserInfo);
    this.logProgress(i18n.t('AddWorkspace.StartLinkingSubWikiToMainWiki'));
    await this.linkWiki(mainWikiPath, wikiFolderName, path.join(parentFolderLocation, wikiFolderName));
    if (typeof tagName === 'string' && tagName.length > 0) {
      this.logProgress(i18n.t('AddWorkspace.AddFileSystemPath'));
      updateSubWikiPluginContent(mainWikiPath, { tagName, subWikiFolderName: wikiFolderName });
    }
  }

  // wiki-startup.ts

  private justStartedWiki: Record<string, boolean> = {};
  public setWikiStartLockOn(wikiFolderLocation: string): void {
    this.justStartedWiki[wikiFolderLocation] = true;
  }

  public setAllWikiStartLockOff(): void {
    this.justStartedWiki = {};
  }

  public checkWikiStartLock(wikiFolderLocation: string): boolean {
    return this.justStartedWiki[wikiFolderLocation] ?? false;
  }

  public async runFilterOnWiki(workspace: IWorkspace, filter: string): Promise<string[] | undefined> {
    const browserView = this.viewService.getView(workspace.id, WindowNames.main);
    if (browserView?.webContents === undefined) {
      logger.error(`browserView.webContents is undefined in runFilterOnWiki ${workspace.id} when running filter ${filter}`);
      return;
    }
    // await service.wiki.runFilterOnWiki(await service.workspace.getActiveWorkspace(), '[is[draft]]')
    const filterResult: string[] = await new Promise((resolve) => {
      /**
       * Use nonce to prevent data racing
       */
      const nonce = Math.random();
      const listener = (_event: Electron.IpcMainEvent, nonceReceived: number, value: string[]): void => {
        if (nonce === nonceReceived) {
          ipcMain.removeListener(WikiChannel.runFilterDone, listener);
          resolve(value);
        }
      };
      ipcMain.on(WikiChannel.runFilterDone, listener);
      browserView.webContents.send(WikiChannel.runFilter, nonce, filter);
    });
    return filterResult;
  }

  public async getTiddlerText(workspace: IWorkspace, title: string): Promise<string | undefined> {
    const browserView = this.viewService.getView(workspace.id, WindowNames.main);
    if (browserView === undefined) {
      logger.error(`browserView is undefined in getTiddlerText ${workspace.id} when running title ${title}`);
      return;
    }
    const textResult: string = await new Promise((resolve) => {
      /**
       * Use nonce to prevent data racing
       */
      const nonce = Math.random();
      const listener = (_event: Electron.IpcMainEvent, nonceReceived: number, value: string): void => {
        if (nonce === nonceReceived) {
          ipcMain.removeListener(WikiChannel.getTiddlerTextDone, listener);
          resolve(value);
        }
      };
      ipcMain.on(WikiChannel.getTiddlerTextDone, listener);
      browserView.webContents.send(WikiChannel.getTiddlerText, nonce, title);
    });
    return textResult;
  }

  /**
   * Trigger git sync
   * Simply do some check before calling `gitService.commitAndSync`
   */
  private async syncWikiIfNeeded(workspace: IWorkspace): Promise<void> {
    const checkCanSyncDueToNoDraft = async (workspace: IWorkspace): Promise<boolean> => {
      const syncOnlyWhenNoDraft = await this.preferenceService.get('syncOnlyWhenNoDraft');
      if (!syncOnlyWhenNoDraft) {
        return true;
      }
      const draftTitles = await this.runFilterOnWiki(workspace, '[is[draft]]');
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (draftTitles && draftTitles.length > 0) {
        return false;
      }
      return true;
    };
    const { gitUrl: githubRepoUrl, storageService, backupOnInterval, id } = workspace;
    const userInfo = await this.authService.getStorageServiceUserInfo(storageService);

    if (
      storageService !== SupportedStorageServices.local &&
      typeof githubRepoUrl === 'string' &&
      userInfo !== undefined &&
      (await checkCanSyncDueToNoDraft(workspace))
    ) {
      const hasChanges = await this.gitService.commitAndSync(workspace, { remoteUrl: githubRepoUrl, userInfo });
      if (hasChanges) {
        await this.workspaceViewService.restartWorkspaceViewService(id);
        await this.viewService.reloadViewsWebContents(id);
      }
    } else if (backupOnInterval && (await checkCanSyncDueToNoDraft(workspace))) {
      await this.gitService.commitAndSync(workspace, { commitOnly: true });
    }
  }

  /**
   * Record<wikiFolderLocation, returnValue<setInterval>>
   * Set this in wikiStartup, and clear it when wiki is down.
   */
  private wikiSyncIntervals: Record<string, NodeJS.Timer> = {};
  /**
   * Trigger git sync interval if needed in config
   */
  private async startIntervalSyncIfNeeded(workspace: IWorkspace): Promise<void> {
    const { syncOnInterval, backupOnInterval, wikiFolderLocation } = workspace;
    if (syncOnInterval || backupOnInterval) {
      const syncDebounceInterval = await this.preferenceService.get('syncDebounceInterval');
      this.wikiSyncIntervals[wikiFolderLocation] = setInterval(async () => {
        await this.syncWikiIfNeeded(workspace);
      }, syncDebounceInterval);
    }
  }

  private stopIntervalSync(workspace: IWorkspace): void {
    const { wikiFolderLocation } = workspace;
    if (typeof this.wikiSyncIntervals[wikiFolderLocation] === 'number') {
      clearInterval(this.wikiSyncIntervals[wikiFolderLocation]);
    }
  }

  public clearAllSyncIntervals(): void {
    Object.values(this.wikiSyncIntervals).forEach((interval) => {
      clearInterval(interval);
    });
  }

  public async wikiStartup(workspace: IWorkspace): Promise<void> {
    const { wikiFolderLocation, port, isSubWiki, mainWikiToLink, id, name, mainWikiID } = workspace;

    // remove $:/StoryList, otherwise it sometimes cause $__StoryList_1.tid to be generated
    // and it will leak private sub-wiki's opened tiddler title
    try {
      void fs.unlink(path.resolve(wikiFolderLocation, 'tiddlers', '$__StoryList')).catch(() => {});
    } catch {
      // do nothing
    }

    // use workspace specific userName first, and fall back to preferences' userName, pass empty editor username if undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const userName = (workspace.userName || (await this.authService.get('userName'))) ?? '';

    // if is main wiki
    if (isSubWiki) {
      // if is private repo wiki
      // if we are creating a sub-wiki just now, restart the main wiki to load content from private wiki
      if (typeof mainWikiToLink === 'string' && !this.checkWikiStartLock(mainWikiToLink)) {
        const mainWorkspace = await this.workspaceService.getByWikiFolderLocation(mainWikiToLink);
        if (mainWorkspace === undefined) {
          throw new SubWikiSMainWikiNotExistError(name ?? id, mainWikiID);
        }
        await this.restartWiki(mainWorkspace);
      }
    } else {
      try {
        logger.debug('startWiki() calling startWiki');
        await this.startWiki(wikiFolderLocation, port, userName);
        logger.debug('startWiki() done');
      } catch (error) {
        logger.warn(`Get startWiki() error: ${(error as Error)?.message}`);
        if (error instanceof WikiRuntimeError && error.retry) {
          logger.warn('Get startWiki() WikiRuntimeError, retrying...');
          // don't want it to throw here again, so no await here.
          // eslint-disable-next-line @typescript-eslint/return-await
          return this.workspaceViewService.restartWorkspaceViewService(id);
        } else if ((error as Error).message.includes('Did not receive an init message from worker after')) {
          // https://github.com/andywer/threads.js/issues/426
          // wait some time and restart the wiki will solve this
          logger.warn(`Get startWiki() handle "${(error as Error)?.message}", will try restart wiki.`);
          await this.restartWiki(workspace);
        } else {
          logger.warn('Get startWiki() unexpected error, throw it');
          throw error;
        }
      }
    }
    await this.startIntervalSyncIfNeeded(workspace);
  }

  public async restartWiki(workspace: IWorkspace): Promise<void> {
    const { wikiFolderLocation, port, userName: workspaceUserName, isSubWiki } = workspace;
    // use workspace specific userName first, and fall back to preferences' userName, pass empty editor username if undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const userName = (workspaceUserName || (await this.authService.get('userName'))) ?? '';

    this.stopIntervalSync(workspace);
    if (!isSubWiki) {
      await this.stopWiki(wikiFolderLocation);
      await this.startWiki(wikiFolderLocation, port, userName);
    }
    await this.startIntervalSyncIfNeeded(workspace);
  }

  public async updateSubWikiPluginContent(mainWikiPath: string, newConfig?: IWorkspace, oldConfig?: IWorkspace): Promise<void> {
    updateSubWikiPluginContent(mainWikiPath, newConfig, oldConfig);
  }

  public wikiOperation<OP extends keyof IWikiOperations>(
    operationType: OP,
    ...arguments_: Parameters<IWikiOperations[OP]>
  ): undefined | ReturnType<IWikiOperations[OP]> {
    if (typeof wikiOperations[operationType] !== 'function') {
      throw new TypeError(`${operationType} gets no useful handler`);
    }
    if (!Array.isArray(arguments_)) {
      // TODO: better type handling here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions
      throw new TypeError(`${(arguments_ as any) ?? ''} (${typeof arguments_}) is not a good argument array for ${operationType}`);
    }
    // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.ts(2556) this maybe a bug of ts... try remove this comment after upgrade ts. And the result become void is weird too.
    const callResult = wikiOperations[operationType](...arguments_);
    return callResult as unknown as ReturnType<IWikiOperations[OP]>;
  }

  public async setWikiLanguage(view: BrowserView, workspaceID: string, tiddlywikiLanguageName: string): Promise<void> {
    const twLanguageUpdateTimeout = 15_000;
    const retryTime = 2000;
    // no need to wait setting wiki language, this sometimes cause slow PC to fail on this step
    void new Promise<void>((resolve, reject) => {
      const onRetryOrDo = (): void => {
        view.webContents.send(WikiChannel.setTiddlerText, '$:/language', tiddlywikiLanguageName, workspaceID);
      };
      const intervalHandle = setInterval(onRetryOrDo, retryTime);
      const onTimeout = (): void => {
        ipcMain.removeListener(WikiChannel.setTiddlerTextDone + workspaceID, onDone);
        clearInterval(intervalHandle);
        const errorMessage =
          `setWikiLanguage("${tiddlywikiLanguageName}"), language "${tiddlywikiLanguageName}" in workspaceID ${workspaceID} is too slow to update after ${twLanguageUpdateTimeout}ms.`;
        logger.error(errorMessage);
        // no need to reject and show error dialog, otherwise user will rise issue. This happens too frequent.
        // reject(new Error(errorMessage));
      };
      const timeoutHandle = setTimeout(onTimeout, twLanguageUpdateTimeout);
      const onDone = (): void => {
        clearTimeout(timeoutHandle);
        clearInterval(intervalHandle);
        resolve();
      };
      ipcMain.once(WikiChannel.setTiddlerTextDone + workspaceID, onDone);
      onRetryOrDo();
    });
  }

  public async openTiddlerInExternal(title: string, wikiFolderLocation?: string): Promise<void> {
    const wikiWorker = this.getWorker(wikiFolderLocation ?? (await this.workspaceService.getActiveWorkspace())?.wikiFolderLocation ?? '');
    if (wikiWorker !== undefined) {
      const tiddlerFileMetadata = await wikiWorker.getTiddlerFileMetadata(title);
      if (tiddlerFileMetadata?.filepath !== undefined) {
        logger.debug(`openTiddlerInExternal() Opening ${tiddlerFileMetadata.filepath}`);
        await shell.openPath(tiddlerFileMetadata.filepath);
      }
    }
  }

  public async getWikiLogs(homePath: string): Promise<{ content: string; filePath: string }> {
    const filePath = getWikiLogFilePath(homePath);
    const content = await fs.readFile(filePath, 'utf8');
    return {
      content,
      filePath,
    };
  }
}
