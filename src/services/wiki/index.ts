/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { injectable } from 'inversify';
import { delay } from 'bluebird';
import fs from 'fs-extra';
import path from 'path';
import { spawn, Thread, Worker, ModuleThread } from 'threads';
import type { WorkerEvent } from 'threads/dist/types/master';
import { BrowserView, dialog, ipcMain, shell } from 'electron';
import chokidar from 'chokidar';
import { trim, compact, debounce } from 'lodash';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IViewService } from '@services/view/interface';
import type { IWorkspaceService, IWorkspace } from '@services/workspaces/interface';
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { logger, wikiOutputToFile, refreshOutputFile, getWikiLogFilePath } from '@services/libs/log';
import i18n from '@services/libs/i18n';
import { lazyInject } from '@services/container';
import { TIDDLYWIKI_TEMPLATE_FOLDER_PATH, TIDDLERS_PATH } from '@/constants/paths';
import { updateSubWikiPluginContent, getSubWikiPluginContent, ISubWikiPluginContent } from './plugin/subWikiPlugin';
import { IWikiService, WikiControlActions } from './interface';
import { WikiChannel } from '@/constants/channels';
import { CopyWikiTemplateError, DoubleWikiInstanceError, WikiRuntimeError } from './error';
import { SupportedStorageServices } from '@services/types';
import type { WikiWorker } from './wikiWorker';

// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=wikiWorker!./wikiWorker.ts';
import { IWikiOperations, wikiOperations } from './wikiOperations';
import { defaultServerIP } from '@/constants/urls';

@injectable()
export class Wiki implements IWikiService {
  @lazyInject(serviceIdentifier.Authentication) private readonly authService!: IAuthenticationService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.Git) private readonly gitService!: IGitService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.View) private readonly viewService!: IViewService;
  @lazyInject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService!: IWorkspaceViewService;

  public async getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]> {
    return await getSubWikiPluginContent(mainWikiPath);
  }

  public async requestOpenTiddlerInWiki(tiddlerName: string): Promise<void> {
    const browserViews = await this.viewService.getActiveBrowserViews();
    browserViews.forEach((browserView) => {
      if (browserView !== undefined) {
        browserView.webContents.send(WikiChannel.openTiddler, tiddlerName);
      }
    });
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
  private wikiWorkers: Record<string, ModuleThread<WikiWorker>> = {};

  public async startWiki(homePath: string, tiddlyWikiPort: number, userName: string): Promise<void> {
    if (this.wikiWorkers[homePath] !== undefined) {
      throw new DoubleWikiInstanceError(homePath);
    }
    // use Promise to handle worker callbacks
    const workspace = await this.workspaceService.getByWikiFolderLocation(homePath);
    const workspaceID = workspace?.id;
    if (workspace === undefined || workspaceID === undefined) {
      logger.error('Try to start wiki, but workspace not found', { homePath, workspace, workspaceID });
      return;
    }
    // wiki server is about to boot, but our webview is just start loading, wait for `view.webContents.on('did-stop-loading'` to set this to false
    await this.workspaceService.updateMetaData(workspaceID, { isLoading: true });
    const workerData = { homePath, userName, tiddlyWikiPort, tiddlyWikiHost: defaultServerIP };
    const worker = await spawn<WikiWorker>(new Worker(workerURL as string));
    this.wikiWorkers[homePath] = worker;
    refreshOutputFile(homePath);
    const loggerMeta = { worker: 'NodeJSWiki', homePath };
    return await new Promise<void>((resolve, reject) => {
      // handle native messages
      Thread.errors(worker).subscribe(async (error) => {
        logger.error(error.message, { ...loggerMeta, ...error });
        wikiOutputToFile(homePath, error.message);
        reject(new WikiRuntimeError(error, homePath, false));
      });
      Thread.events(worker).subscribe((event: WorkerEvent) => {
        if (event.type === 'message') {
          const messageString = JSON.stringify(event.data);
          wikiOutputToFile(homePath, `${messageString}\n`);
          logger.debug('wiki message', { ...event.data, ...loggerMeta });
        } else if (event.type === 'termination') {
          delete this.wikiWorkers[homePath];
          const warningMessage = `NodeJSWiki ${homePath} Worker stopped (can be normal quit, or unexpected error, see other logs to determine)`;
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
                return reject(new WikiRuntimeError(new Error(message.message), homePath, true, { ...workspace, ...portChange }));
              }
              reject(new WikiRuntimeError(new Error(message.message), homePath, false));
            }
          }
        } else if (message.type === 'stderr' || message.type === 'stdout') {
          wikiOutputToFile(homePath, message.message);
        }
      });
    });
  }

  public async stopWiki(homePath: string): Promise<void> {
    const worker = this.wikiWorkers[homePath];
    if (worker === undefined) {
      logger.warning(`No wiki for ${homePath}. No running worker, means maybe tiddlywiki server in this workspace failed to start`, {
        function: 'stopWiki',
      });
      return await Promise.resolve();
    }
    try {
      await Thread.terminate(worker);
      await delay(100);
    } catch (error) {
      logger.error(`Wiki-worker have error ${(error as Error).message} when try to stop`, { function: 'stopWiki' });
      // await worker.terminate();
    }
    (this.wikiWorkers[homePath] as any) = undefined;
    await this.stopWatchWiki(homePath);
    logger.info(`Wiki-worker for ${homePath} stopped`, { function: 'stopWiki' });
  }

  /**
   * Stop all worker_thread, use and await this before app.quit()
   */
  public async stopAllWiki(): Promise<void> {
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
    const mainWikiTiddlersFolderPath = path.join(mainWikiPath, TIDDLERS_PATH, this.folderToContainSymlinks, folderName);
    try {
      try {
        await fs.remove(mainWikiTiddlersFolderPath);
      } catch {}
      await fs.createSymlink(subWikiPath, mainWikiTiddlersFolderPath, 'junction');
      this.logProgress(i18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiSucceed'));
    } catch (error: unknown) {
      throw new Error(i18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiFailed', { subWikiPath, mainWikiTiddlersFolderPath, error }));
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

  /**
   * Watch wiki change so we can trigger git sync
   * Simply do some check before calling `this.watchWikiForDebounceCommitAndSync`
   */
  private async tryWatchForSync(workspace: IWorkspace, watchPath?: string): Promise<void> {
    const { wikiFolderLocation, gitUrl: githubRepoUrl, storageService } = workspace;
    const userInfo = await this.authService.getStorageServiceUserInfo(storageService);
    if (storageService !== SupportedStorageServices.local && typeof githubRepoUrl === 'string' && userInfo !== undefined) {
      await this.watchWikiForDebounceCommitAndSync(wikiFolderLocation, githubRepoUrl, userInfo, watchPath);
    }
  }

  public async wikiStartup(workspace: IWorkspace): Promise<void> {
    const { wikiFolderLocation, port, isSubWiki, mainWikiToLink, syncOnIntervalDebounced, syncOnInterval, id } = workspace;

    // remove $:/StoryList, otherwise it sometimes cause $__StoryList_1.tid to be generated
    try {
      await fs.unlink(path.resolve(wikiFolderLocation, 'tiddlers', '$__StoryList'));
    } catch {
      // do nothing
    }

    // use workspace specific userName first, and fall back to preferences' userName, pass empty editor username if undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const userName = (workspace.userName || (await this.authService.get('userName'))) ?? '';

    // if is main wiki
    if (!isSubWiki) {
      try {
        await this.startWiki(wikiFolderLocation, port, userName);
        logger.debug('startWiki() done');
      } catch (error) {
        if (error instanceof WikiRuntimeError && error.retry) {
          logger.warn('Get startWiki() error, retrying...');
          // don't want it to throw here again, so no await here.
          // eslint-disable-next-line @typescript-eslint/return-await
          return this.workspaceViewService.restartWorkspaceViewService(id);
        }
      }
      // sync to cloud, do this in a non-blocking way
      if (syncOnInterval && syncOnIntervalDebounced) {
        void this.tryWatchForSync(workspace, path.join(wikiFolderLocation, TIDDLERS_PATH));
      }
    } else {
      // if is private repo wiki
      // if we are creating a sub-wiki just now, restart the main wiki to load content from private wiki
      if (typeof mainWikiToLink === 'string' && !this.checkWikiStartLock(mainWikiToLink)) {
        const mainWorkspace = await this.workspaceService.getByWikiFolderLocation(mainWikiToLink);
        if (mainWorkspace === undefined) {
          throw new Error(`mainWorkspace is undefined in wikiStartup() for mainWikiPath ${mainWikiToLink}`);
        }
        await this.restartWiki(mainWorkspace);
        // sync self to cloud, subwiki's content is all in root folder path, do this in a non-blocking way
        if (syncOnInterval && syncOnIntervalDebounced) {
          void this.tryWatchForSync(workspace);
        }
      }
    }
  }

  public async restartWiki(workspace: IWorkspace): Promise<void> {
    const { wikiFolderLocation, port, userName: workspaceUserName, isSubWiki, syncOnIntervalDebounced, syncOnInterval } = workspace;
    // use workspace specific userName first, and fall back to preferences' userName, pass empty editor username if undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const userName = (workspaceUserName || (await this.authService.get('userName'))) ?? '';

    await this.stopWatchWiki(wikiFolderLocation);
    if (!isSubWiki) {
      await this.stopWiki(wikiFolderLocation);
      await this.startWiki(wikiFolderLocation, port, userName);
    }
    if (syncOnInterval && syncOnIntervalDebounced) {
      if (isSubWiki) {
        // sync sub wiki to cloud, do this in a non-blocking way
        void this.tryWatchForSync(workspace, wikiFolderLocation);
      } else {
        // sync main wiki to cloud, do this in a non-blocking way
        void this.tryWatchForSync(workspace, path.join(wikiFolderLocation, TIDDLERS_PATH));
      }
    }
  }

  // watch-wiki.ts
  private readonly frequentlyChangedFileThatShouldBeIgnoredFromWatch = ['output', /\$__StoryList/];
  private readonly topLevelFoldersToIgnored = ['node_modules', '.git'];

  // key is same to workspace wikiFolderLocation, so we can get this watcher by workspace wikiFolderLocation
  // { [wikiFolderLocation: string]: Watcher }
  private readonly wikiWatchers: Record<string, chokidar.FSWatcher> = {};

  /**
   * watch wiki change and reset git sync count down
   */
  public async watchWikiForDebounceCommitAndSync(
    wikiRepoPath: string,
    githubRepoUrl: string,
    userInfo: IGitUserInfos,
    wikiFolderPath = wikiRepoPath,
  ): Promise<void> {
    if (!fs.existsSync(wikiRepoPath)) {
      logger.error('Folder not exist in watchFolder()', { wikiRepoPath, wikiFolderPath, githubRepoUrl });
      return;
    }
    // simple lock to prevent running two instance of commit task
    let lock = false;
    const onChange = debounce((fileName: string): void => {
      if (lock) {
        logger.info(`${fileName} changed, but lock is on, so skip`);
        return;
      }
      logger.info(`${fileName} changed`);
      lock = true;
      // TODO: handle this promise, it might be undefined, need some test
      void this.gitService.debounceCommitAndSync(wikiRepoPath, githubRepoUrl, userInfo)?.then(() => {
        lock = false;
      });
    }, 1000);
    // load ignore config from .gitignore located in the wiki repo folder
    const gitIgnoreFilePath = path.join(wikiRepoPath, '.gitignore');
    let gitignoreFile = '';
    try {
      gitignoreFile = fs.readFileSync(gitIgnoreFilePath, 'utf-8') ?? '';
    } catch {
      logger.info(`Fail to load .gitignore from ${gitIgnoreFilePath}, this is ok if you don't need a .gitignore in the subwiki.`, {
        wikiRepoPath,
        wikiFolderPath,
        githubRepoUrl,
      });
    }
    const filesToIgnoreFromGitIgnore = compact(gitignoreFile.split('\n').filter((line) => !trim(line).startsWith('#')));
    const watcher = chokidar.watch(wikiFolderPath, {
      ignored: [...filesToIgnoreFromGitIgnore, ...this.topLevelFoldersToIgnored, ...this.frequentlyChangedFileThatShouldBeIgnoredFromWatch],
      cwd: wikiFolderPath,
      awaitWriteFinish: true,
      ignoreInitial: true,
      followSymlinks: false,
      disableGlobbing: true,
    });
    watcher.on('add', onChange);
    watcher.on('change', onChange);
    watcher.on('unlink', onChange);
    await new Promise<void>((resolve) => {
      watcher.on('ready', () => {
        logger.info(`wiki Github syncer is watching ${wikiFolderPath} now`, { wikiRepoPath, wikiFolderPath, githubRepoUrl });
        this.wikiWatchers[wikiRepoPath] = watcher;
        resolve();
      });
    });
  }

  public async stopWatchWiki(wikiRepoPath: string): Promise<void> {
    const watcher = this.wikiWatchers[wikiRepoPath];
    if (watcher !== undefined) {
      await watcher.close();
      logger.info(`Wiki watcher for ${wikiRepoPath} stopped`, { function: 'stopWatchWiki' });
    } else {
      logger.warning(`No wiki watcher for ${wikiRepoPath}`, { function: 'stopWatchWiki' });
    }
  }

  public async stopWatchAllWiki(): Promise<void> {
    const tasks = [];
    for (const homePath of Object.keys(this.wikiWatchers)) {
      tasks.push(this.stopWatchWiki(homePath));
    }
    await Promise.all(tasks);
    logger.info('All wiki watcher is stopped', { function: 'stopWatchAllWiki' });
  }

  public async updateSubWikiPluginContent(mainWikiPath: string, newConfig?: IWorkspace, oldConfig?: IWorkspace): Promise<void> {
    return updateSubWikiPluginContent(mainWikiPath, newConfig, oldConfig);
  }

  public wikiOperation<OP extends keyof IWikiOperations>(
    operationType: OP,
    arguments_: Parameters<IWikiOperations[OP]>,
  ): undefined | ReturnType<IWikiOperations[OP]> {
    if (typeof wikiOperations[operationType] !== 'function') {
      throw new TypeError(`${operationType} gets no useful handler`);
    }
    if (!Array.isArray(arguments_)) {
      // TODO: better type handling here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions
      throw new TypeError(`${(arguments_ as any) ?? ''} (${typeof arguments_}) is not a good argument array for ${operationType}`);
    }
    return wikiOperations[operationType].apply(undefined, arguments_) as unknown as ReturnType<IWikiOperations[OP]>;
  }

  public async setWikiLanguage(view: BrowserView, workspaceID: string, tiddlywikiLanguageName: string): Promise<void> {
    const twLanguageUpdateTimeout = 15_000;
    const retryTime = 2000;
    return await new Promise<void>((resolve, reject) => {
      const onRetryOrDo = (): void => {
        view.webContents.send(WikiChannel.setTiddlerText, '$:/language', tiddlywikiLanguageName, workspaceID);
      };
      const intervalHandle = setInterval(onRetryOrDo, retryTime);
      const onTimeout = (): void => {
        ipcMain.removeListener(WikiChannel.setTiddlerTextDone + workspaceID, onDone);
        clearInterval(intervalHandle);
        const errorMessage = `setWikiLanguage("${tiddlywikiLanguageName}"), language "${tiddlywikiLanguageName}" in workspaceID ${workspaceID} is too slow to update after ${twLanguageUpdateTimeout}ms.`;
        logger.error(errorMessage);
        reject(new Error(errorMessage));
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

  public async openTiddlerInExternal(title: string, homePath?: string): Promise<void> {
    const wikiWorker = this.wikiWorkers[homePath ?? (await this.workspaceService.getActiveWorkspace())?.wikiFolderLocation ?? ''];
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
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      content,
      filePath,
    };
  }
}
