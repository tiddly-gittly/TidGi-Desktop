import { createWorkerProxy, terminateWorker } from '@services/libs/workerAdapter';
import { dialog, shell } from 'electron';
import { attachWorker } from 'electron-ipc-cat/server';
import { backOff } from 'exponential-backoff';
import { copy, exists, mkdir, mkdirs, pathExists, readdir, readFile } from 'fs-extra';
import { inject, injectable } from 'inversify';
import path from 'path';
import { Worker } from 'worker_threads';
// @ts-expect-error - Vite worker import with ?nodeWorker query
import WikiWorkerFactory from './wikiWorker/index?nodeWorker';

import { container } from '@services/container';

import { WikiChannel } from '@/constants/channels';
import { getTiddlyWikiBootPath, TIDDLERS_PATH, TIDDLYWIKI_BUILT_IN_PLUGINS_PATH, TIDDLYWIKI_TEMPLATE_FOLDER_PATH } from '@/constants/paths';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { Observable } from 'rxjs';
import type { IChangedTiddlers } from 'tiddlywiki';
import { AlreadyExistError, CopyWikiTemplateError, DoubleWikiInstanceError, HTMLCanNotLoadError, SubWikiSMainWikiNotExistError, WikiRuntimeError } from './error';
import type { IWikiService } from './interface';
import { WikiControlActions } from './interface';
import type { IStartNodeJSWikiConfigs, WikiWorker } from './wikiWorker';
import type { IpcServerRouteMethods, IpcServerRouteNames } from './wikiWorker/ipcServerRoutes';

import { LOG_FOLDER } from '@/constants/appPaths';
import { isDevelopmentOrTest } from '@/constants/environment';
import { isHtmlWiki } from '@/constants/fileNames';
import { defaultServerIP } from '@/constants/urls';
import type { IDatabaseService } from '@services/database/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import type { ISyncService } from '@services/sync/interface';
import type { IThemeService } from '@services/theme/interface';
import { serializeError } from 'serialize-error';
import { wikiWorkerStartedEventName } from './constants';
import type { IWorkerWikiOperations } from './wikiOperations/executor/wikiOperationInServer';
import { getSendWikiOperationsToBrowser } from './wikiOperations/sender/sendWikiOperationsToBrowser';
import type { ISendWikiOperationsToBrowser } from './wikiOperations/sender/sendWikiOperationsToBrowser';

@injectable()
export class Wiki implements IWikiService {
  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.Database) private readonly databaseService: IDatabaseService,
    @inject(serviceIdentifier.ThemeService) private readonly themeService: IThemeService,
  ) {
  }

  // handlers
  public async copyWikiTemplate(newFolderPath: string, folderName: string): Promise<void> {
    logger.info('starting', {
      newFolderPath,
      folderName,
      function: 'copyWikiTemplate',
    });
    try {
      await this.createWiki(newFolderPath, folderName);
      const entries = await readdir(path.join(newFolderPath, folderName));
      logger.debug('completed', {
        newFolderPath,
        folderName,
        function: 'copyWikiTemplate',
        entries,
      });
    } catch (error) {
      logger.error('failed', {
        error,
        newFolderPath,
        folderName,
        function: 'copyWikiTemplate',
      });
      throw new CopyWikiTemplateError(`${(error as Error).message}, (${newFolderPath}, ${folderName})`);
    }
  }

  // key is same to workspace id, so we can get this worker by workspace id
  private wikiWorkers: Partial<Record<string, { detachWorker: () => void; nativeWorker: Worker; proxy: WikiWorker }>> = {};

  public getWorker(id: string): WikiWorker | undefined {
    return this.wikiWorkers[id]?.proxy;
  }

  private getNativeWorker(id: string): Worker | undefined {
    return this.wikiWorkers[id]?.nativeWorker;
  }

  private readonly wikiWorkerStartedEventTarget = new EventTarget();

  public async startWiki(workspaceID: string, userName: string): Promise<void> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);

    if (workspaceID === undefined) {
      logger.error('Try to start wiki, but workspace ID not provided', { workspaceID });
      return;
    }
    const previousWorker = this.getWorker(workspaceID);
    if (previousWorker !== undefined) {
      logger.error(new DoubleWikiInstanceError(workspaceID).message, { stack: new Error('stack').stack?.replace('Error:', '') ?? 'no stack' });
      await this.stopWiki(workspaceID);
    }
    // use Promise to handle worker callbacks
    const workspace = await workspaceService.get(workspaceID);
    if (workspace === undefined) {
      logger.error('Try to start wiki, but workspace not found', { workspace, workspaceID });
      return;
    }
    if (!isWikiWorkspace(workspace)) {
      logger.error('Try to start wiki, but workspace is not a wiki workspace', { workspace, workspaceID });
      return;
    }
    const { port, rootTiddler, readOnlyMode, tokenAuth, homeUrl, lastUrl, https, excludedPlugins, isSubWiki, wikiFolderLocation, name, enableHTTPAPI, authToken } = workspace;
    logger.debug('startWiki: Got workspace from workspaceService', {
      workspaceID,
      name,
      port,
      enableHTTPAPI,
      wikiFolderLocation,
      hasAllRequiredFields: port !== undefined && name !== undefined,
    });
    if (isSubWiki) {
      logger.error('Try to start wiki, but workspace is sub wiki', { workspace, workspaceID });
      return;
    }
    // wiki server is about to boot, but our webview is just start loading, wait for `view.webContents.on('did-stop-loading'` to set this to false
    await workspaceService.updateMetaData(workspaceID, { isLoading: true });
    if (tokenAuth && authToken) {
      logger.debug('getOneTimeAdminAuthTokenForWorkspaceSync', {
        tokenAuth,
        authToken,
        function: 'startWiki',
      });
    }
    const shouldUseDarkColors = await this.themeService.shouldUseDarkColors();

    // Get sub-wikis for this main wiki to load their tiddlers
    const subWikis = await workspaceService.getSubWorkspacesAsList(workspaceID);

    const workerData: IStartNodeJSWikiConfigs = {
      authToken,
      constants: { TIDDLY_WIKI_BOOT_PATH: getTiddlyWikiBootPath(wikiFolderLocation), TIDDLYWIKI_BUILT_IN_PLUGINS_PATH },
      enableHTTPAPI,
      excludedPlugins,
      homePath: wikiFolderLocation,
      https,
      isDev: isDevelopmentOrTest,
      openDebugger: process.env.DEBUG_WORKER === 'true',
      readOnlyMode,
      rootTiddler,
      shouldUseDarkColors,
      subWikis,
      tiddlyWikiHost: defaultServerIP,
      tiddlyWikiPort: port,
      tokenAuth,
      userName,
      workspace,
    };
    logger.debug('Worker configuration prepared', {
      workspaceID,
      port,
      userName,
      enableHTTPAPI,
      readOnlyMode,
      tokenAuth,
      wikiFolderLocation,
      workspaceName: workspace.name,
      function: 'Wiki.startWiki',
    });
    logger.debug('initializing wikiWorker for workspace', {
      workspaceID,
      function: 'Wiki.startWiki',
    });

    // Create native nodejs worker using Vite's ?nodeWorker import
    const wikiWorker = (WikiWorkerFactory as () => Worker)();

    // Attach worker to all registered services (from bindServiceAndProxy)
    const detachWorker = attachWorker(wikiWorker);

    const worker = createWorkerProxy<WikiWorker>(wikiWorker);

    logger.debug(`wikiWorker initialized`, { function: 'Wiki.startWiki' });
    this.wikiWorkers[workspaceID] = { proxy: worker, nativeWorker: wikiWorker, detachWorker };
    this.wikiWorkerStartedEventTarget.dispatchEvent(new Event(wikiWorkerStartedEventName(workspaceID)));
    void worker.notifyServicesReady();

    const loggerMeta = { worker: 'NodeJSWiki', homePath: wikiFolderLocation, workspaceID };

    await new Promise<void>((resolve, reject) => {
      // Handle worker errors
      wikiWorker.on('error', (error: Error) => {
        logger.error(error.message, { function: 'Worker.error', ...loggerMeta });
        reject(new WikiRuntimeError(error, name, false));
      });

      // Capture worker stderr to diagnose crashes
      if (wikiWorker.stderr) {
        wikiWorker.stderr.on('data', (data: Buffer | string) => {
          const message = typeof data === 'string' ? data : data.toString();
          logger.error('Worker stderr', { message: message.trim(), ...loggerMeta });
        });
      }
      // Capture worker stdout before intercept is set up
      if (wikiWorker.stdout) {
        wikiWorker.stdout.on('data', (data: Buffer | string) => {
          const message = typeof data === 'string' ? data : data.toString();
          logger.debug('Worker stdout', { message: message.trim(), ...loggerMeta });
        });
      }

      // Handle worker exit
      wikiWorker.on('exit', (code) => {
        delete this.wikiWorkers[workspaceID];
        const warningMessage = `NodeJSWiki ${workspaceID} Worker stopped with code ${code}`;
        logger.info(warningMessage, loggerMeta);
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        } else {
          resolve();
        }
      });

      // Handle worker messages (for logging)
      wikiWorker.on('message', (message: unknown) => {
        if (message && typeof message === 'object' && 'log' in message) {
          logger.info('Worker message', { data: message, ...loggerMeta });
        }
      });

      // subscribe to the Observable that startNodeJSWiki returns, handle messages send by our code
      logger.debug('startWiki calling startNodeJSWiki in the main process', { function: 'wikiWorker.startNodeJSWiki' });

      worker.startNodeJSWiki(workerData).subscribe(async (message) => {
        if (message.type === 'control') {
          await workspaceService.update(workspaceID, { lastNodeJSArgv: message.argv }, true);
          switch (message.actions) {
            case WikiControlActions.booted: {
              setTimeout(async () => {
                logger.info('resolved with control booted', {
                  ...loggerMeta,
                  message: message.message,
                  workspaceID,
                  function: 'startWiki',
                });
                resolve();
              }, 100);
              break;
            }
            case WikiControlActions.start: {
              if (message.message !== undefined) {
                logger.debug('WikiControlActions.start', { 'message.message': message.message, ...loggerMeta, workspaceID });
              }
              break;
            }
            case WikiControlActions.listening: {
              // API server started, but we are using IPC to serve content now, so do nothing here.
              if (message.message !== undefined) {
                logger.info('WikiControlActions.listening ' + message.message, { ...loggerMeta, workspaceID });
              }
              break;
            }
            case WikiControlActions.error: {
              const errorMessage = message.message ?? 'get WikiControlActions.error without message';
              logger.error('rejected with control error', {
                ...loggerMeta,
                message,
                errorMessage,
                workspaceID,
                function: 'startWiki',
              });
              await workspaceService.updateMetaData(workspaceID, { isLoading: false, didFailLoadErrorMessage: errorMessage });

              // For plugin errors that occur after wiki boot, realign the view to hide it and show error message
              const isPluginError = message.source === 'plugin-error';
              if (isPluginError && workspace.active) {
                const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
                await workspaceViewService.realignActiveWorkspace(workspaceID);
                logger.info('Realigned view after plugin error', { workspaceID, function: 'startWiki' });
              }

              // fix "message":"listen EADDRINUSE: address already in use 0.0.0.0:5212"
              if (errorMessage.includes('EADDRINUSE')) {
                const portChange = {
                  port: port + 1,
                  homeUrl: homeUrl.replace(`:${port}`, `:${port + 1}`),

                  lastUrl: lastUrl?.replace(`:${port}`, `:${port + 1}`) ?? null,
                };
                await workspaceService.update(workspaceID, portChange, true);
                reject(new WikiRuntimeError(new Error(message.message), wikiFolderLocation, true, { ...workspace, ...portChange }));
                return;
              }

              // For plugin errors, don't reject - let user see the error and try to recover
              if (!isPluginError) {
                reject(new WikiRuntimeError(new Error(message.message), wikiFolderLocation, false, { ...workspace }));
              }
            }
          }
        }
      });
    });
    void this.afterWikiStart(workspaceID);
  }

  private async afterWikiStart(workspaceID: string): Promise<void> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.get(workspaceID);
    if (workspace === undefined) {
      logger.error('get workspace failed', { workspaceID, function: 'afterWikiStart' });
      return;
    }
    if (!isWikiWorkspace(workspace)) {
      return;
    }
    const { isSubWiki, enableHTTPAPI } = workspace;
    if (!isSubWiki && enableHTTPAPI) {
      // Auto enable server filters if HTTP API is enabled. So this feature immediately available to 3rd party apps, reduce user confusion.
      await this.wikiOperationInServer(WikiChannel.addTiddler, workspaceID, [
        '$:/config/Server/AllowAllExternalFilters',
        'yes',
      ]);
    }
  }

  /**
   * Ensure you get a started worker. If not stated, it will await for it to start.
   * @param workspaceID
   */
  private async getWorkerEnsure(workspaceID: string): Promise<WikiWorker> {
    let worker = this.getWorker(workspaceID);
    if (worker === undefined) {
      // wait for wiki worker started
      await new Promise<void>(resolve => {
        this.wikiWorkerStartedEventTarget.addEventListener(wikiWorkerStartedEventName(workspaceID), () => {
          resolve();
        });
      });
    } else {
      return worker;
    }
    worker = this.getWorker(workspaceID);
    if (worker === undefined) {
      const errorMessage =
        `Still no wiki for ${workspaceID} after wikiWorkerStartedEventTarget.addEventListener(wikiWorkerStartedEventName. No running worker, maybe tiddlywiki server in this workspace failed to start`;
      logger.error(
        errorMessage,
        {
          function: 'getWorkerEnsure',
        },
      );
      throw new Error(errorMessage);
    }
    return worker;
  }

  public async callWikiIpcServerRoute<NAME extends IpcServerRouteNames>(workspaceID: string, route: NAME, ...arguments_: Parameters<IpcServerRouteMethods[NAME]>) {
    // don't log full `arguments_` here, it might contains huge text
    logger.debug(`callWikiIpcServerRoute get ${route}`, { workspaceID });
    const worker = await this.getWorkerEnsure(workspaceID);
    logger.debug(`callWikiIpcServerRoute got worker`);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Argument of type 'string | string[] | ITiddlerFields | undefined' is not assignable to parameter of type 'string'. Type 'undefined' is not assignable to type 'string'.ts(2345)
    const response = await worker[route](...arguments_);
    logger.debug(`callWikiIpcServerRoute returning response`, { route, code: response.statusCode });
    return response;
  }

  public getWikiChangeObserver$(workspaceID: string): Observable<IChangedTiddlers> {
    return new Observable((observer) => {
      const getWikiChangeObserverIIFE = async () => {
        const worker = await this.getWorkerEnsure(workspaceID);
        const observable = worker.getWikiChangeObserver();
        observable.subscribe(observer);
      };
      void getWikiChangeObserverIIFE();
    });
  }

  public async extractWikiHTML(htmlWikiPath: string, saveWikiFolderPath: string): Promise<string | undefined> {
    // hope saveWikiFolderPath = ParentFolderPath + wikifolderPath
    // We want the folder where the WIKI is saved to be empty, and we want the input htmlWiki to be an HTML file even if it is a non-wikiHTML file. Otherwise the program will exit abnormally.
    const nativeWorker = (WikiWorkerFactory as () => Worker)();
    const worker = createWorkerProxy<WikiWorker>(nativeWorker);

    try {
      if (!isHtmlWiki(htmlWikiPath)) {
        throw new HTMLCanNotLoadError(htmlWikiPath);
      }
      if (await exists(saveWikiFolderPath)) {
        throw new AlreadyExistError(saveWikiFolderPath);
      }
      await worker.extractWikiHTML(htmlWikiPath, saveWikiFolderPath, { TIDDLY_WIKI_BOOT_PATH: getTiddlyWikiBootPath(saveWikiFolderPath) });
    } catch (error) {
      const result = `${(error as Error).name} ${(error as Error).message}`;
      logger.error(result, { worker: 'NodeJSWiki', method: 'extractWikiHTML', htmlWikiPath, saveWikiFolderPath });
      return result;
    } finally {
      // this worker is only for one time use. we will spawn a new one for starting wiki later.
      await terminateWorker(nativeWorker);
    }
  }

  public async packetHTMLFromWikiFolder(wikiFolderLocation: string, pathOfNewHTML: string): Promise<void> {
    const nativeWorker = (WikiWorkerFactory as () => Worker)();
    const worker = createWorkerProxy<WikiWorker>(nativeWorker);

    try {
      await worker.packetHTMLFromWikiFolder(wikiFolderLocation, pathOfNewHTML, { TIDDLY_WIKI_BOOT_PATH: getTiddlyWikiBootPath(wikiFolderLocation) });
    } finally {
      // this worker is only for one time use. we will spawn a new one for starting wiki later.
      await terminateWorker(nativeWorker);
    }
  }

  public async stopWiki(id: string): Promise<void> {
    const workerData = this.wikiWorkers[id];
    const worker = workerData?.proxy;
    const nativeWorker = workerData?.nativeWorker;
    const detachWorker = workerData?.detachWorker;

    if (worker === undefined || nativeWorker === undefined) {
      logger.warn(`No wiki for ${id}. No running worker, means maybe tiddlywiki server in this workspace failed to start`, {
        function: 'stopWiki',
        stack: new Error('stack').stack?.replace('Error:', '') ?? 'no stack',
      });
      return;
    }

    const syncService = container.get<ISyncService>(serviceIdentifier.Sync);
    syncService.stopIntervalSync(id);

    try {
      logger.info(`worker.beforeExit for ${id}`);
      await worker.beforeExit();
      logger.info(`terminateWorker for ${id}`);
      await terminateWorker(nativeWorker);
      // Detach worker from service message handlers
      if (detachWorker !== undefined) {
        logger.info(`detachWorker for ${id}`);
        detachWorker();
      }
    } catch (error) {
      logger.error('wiki worker stop failed', { function: 'stopWiki', error });
    }

    delete this.wikiWorkers[id];
    logger.info(`Wiki-worker for ${id} stopped`, { function: 'stopWiki' });
  }

  /**
   * Stop all worker_thread, use and await this before app.quit()
   */
  public async stopAllWiki(): Promise<void> {
    logger.debug('stopAllWiki', {
      function: 'stopAllWiki',
    });
    const tasks = [];
    for (const id of Object.keys(this.wikiWorkers)) {
      tasks.push(this.stopWiki(id));
    }
    await Promise.all(tasks);
    logger.info('All wiki workers are stopped', { function: 'stopAllWiki' });
  }

  /**
   * Send message to UI via WikiChannel.createProgress
   * @param message will show in the UI
   */
  private readonly logProgress = (message: string): void => {
    logger.info(message, { handler: WikiChannel.createProgress });
  };

  private async createWiki(newFolderPath: string, folderName: string): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartUsingTemplateToCreateWiki'));
    const newWikiPath = path.join(newFolderPath, folderName);
    if (!(await pathExists(newFolderPath))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { path: newFolderPath }));
    }
    if (!(await pathExists(TIDDLYWIKI_TEMPLATE_FOLDER_PATH))) {
      throw new Error(i18n.t('AddWorkspace.WikiTemplateMissing', { TIDDLYWIKI_TEMPLATE_FOLDER_PATH }));
    }
    if (await pathExists(newWikiPath)) {
      throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
    }
    try {
      await copy(TIDDLYWIKI_TEMPLATE_FOLDER_PATH, newWikiPath, {
        filter: (source: string, _destination: string) => {
          // keep xxx/template/wiki/.gitignore
          // keep xxx/template/wiki/.github
          // ignore xxx/template/wiki/.git
          // prevent copy wiki repo's .git folder
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

  public async createSubWiki(parentFolderLocation: string, folderName: string, onlyLink = false): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartCreatingSubWiki'));
    const newWikiPath = path.join(parentFolderLocation, folderName);
    if (!(await pathExists(parentFolderLocation))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { path: parentFolderLocation }));
    }
    if (!onlyLink) {
      if (await pathExists(newWikiPath)) {
        throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
      }
      try {
        await mkdirs(newWikiPath);
      } catch {
        throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
      }
    }
    // Sub-wiki configuration is now handled by FileSystemAdaptor in watch-filesystem plugin
    // No need to update $:/config/FileSystemPaths manually or create symlinks
    this.logProgress(i18n.t('AddWorkspace.SubWikiCreationCompleted'));
  }

  public async removeWiki(wikiPath: string, _mainWikiToUnLink?: string, _onlyRemoveLink = false): Promise<void> {
    // Sub-wiki configuration is now handled by FileSystemAdaptor - no symlinks to manage
    // Just remove the wiki folder itself
    await shell.trashItem(wikiPath);
  }

  public async ensureWikiExist(wikiPath: string, shouldBeMainWiki: boolean): Promise<void> {
    logger.debug('checking wiki folder', {
      wikiPath,
      shouldBeMainWiki,
    });
    if (!(await pathExists(wikiPath))) {
      const error = i18n.t('AddWorkspace.PathNotExist', { path: wikiPath });
      logger.error('path does not exist', {
        wikiPath,
        function: 'ensureWikiExist',
      });
      throw new Error(error);
    }
    const wikiInfoPath = path.resolve(wikiPath, 'tiddlywiki.info');
    const wikiInfoExists = await pathExists(wikiInfoPath);
    logger.debug('checked tiddlywiki.info', {
      wikiInfoPath,
      exists: wikiInfoExists,
    });
    if (shouldBeMainWiki && !wikiInfoExists) {
      const entries = await readdir(wikiPath);
      logger.error('tiddlywiki.info missing', {
        wikiPath,
        wikiInfoPath,
        function: 'ensureWikiExist',
        entries,
      });
      throw new Error(i18n.t('AddWorkspace.ThisPathIsNotAWikiFolder', { wikiPath, wikiInfoPath }));
    }
    const tiddlersPath = path.join(wikiPath, TIDDLERS_PATH);
    const tiddlersExists = await pathExists(tiddlersPath);
    logger.debug('checked tiddlers folder', {
      tiddlersPath,
      exists: tiddlersExists,
    });
    if (shouldBeMainWiki && !tiddlersExists) {
      logger.error('tiddlers folder missing', {
        wikiPath,
        tiddlersPath,
        function: 'ensureWikiExist',
      });
      throw new Error(i18n.t('AddWorkspace.ThisPathIsNotAWikiFolder', { wikiPath }));
    }
    logger.debug('validation passed', {
      wikiPath,
      function: 'ensureWikiExist',
    });
  }

  public async checkWikiExist(workspace: IWorkspace, options: { shouldBeMainWiki?: boolean; showDialog?: boolean } = {}): Promise<string | true> {
    if (!isWikiWorkspace(workspace)) {
      return true; // dedicated workspaces always "exist"
    }
    const { wikiFolderLocation, id: workspaceID, name } = workspace;
    const { shouldBeMainWiki, showDialog } = options;
    try {
      if (typeof wikiFolderLocation !== 'string' || wikiFolderLocation.length === 0 || !path.isAbsolute(wikiFolderLocation)) {
        const errorMessage = i18n.t('Dialog.NeedCorrectTiddlywikiFolderPath', { name, wikiFolderLocation });
        logger.error(errorMessage);
        const windowService = container.get<IWindowService>(serviceIdentifier.Window);
        const mainWindow = windowService.get(WindowNames.main);
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
      const windowService = container.get<IWindowService>(serviceIdentifier.Window);
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow !== undefined && showDialog === true) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          title: i18n.t('Dialog.WorkspaceFolderRemoved'),
          message: errorMessage,
          buttons: [i18n.t('Dialog.RemoveWorkspace'), i18n.t('Dialog.DoNotCare')],
          cancelId: 1,
          defaultId: 0,
        });
        if (response === 0) {
          const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
          await workspaceViewService.removeWorkspaceView(workspaceID);
        }
      }
      return errorMessage;
    }
  }

  public async cloneWiki(parentFolderLocation: string, wikiFolderName: string, gitRepoUrl: string, gitUserInfo: IGitUserInfos): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartCloningWiki'));
    const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
    if (!(await pathExists(parentFolderLocation))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { path: parentFolderLocation }));
    }
    if (await pathExists(newWikiPath)) {
      throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
    }
    try {
      await mkdir(newWikiPath);
    } catch {
      throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
    }
    const gitService = container.get<IGitService>(serviceIdentifier.Git);
    await gitService.clone(gitRepoUrl, path.join(parentFolderLocation, wikiFolderName), gitUserInfo);
  }

  public async cloneSubWiki(parentFolderLocation: string, wikiFolderName: string, gitRepoUrl: string, gitUserInfo: IGitUserInfos): Promise<void> {
    this.logProgress(i18n.t('AddWorkspace.StartCloningSubWiki'));
    const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
    if (!(await pathExists(parentFolderLocation))) {
      throw new Error(i18n.t('AddWorkspace.PathNotExist', { path: parentFolderLocation }));
    }
    if (await pathExists(newWikiPath)) {
      throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
    }
    try {
      await mkdir(newWikiPath);
    } catch {
      throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
    }
    const gitService = container.get<IGitService>(serviceIdentifier.Git);
    await gitService.clone(gitRepoUrl, path.join(parentFolderLocation, wikiFolderName), gitUserInfo);
    // Sub-wiki configuration is now handled by FileSystemAdaptor in watch-filesystem plugin
    // No need to update $:/config/FileSystemPaths manually or create symlinks
  }

  // wiki-startup.ts

  private justStartedWiki: Record<string, boolean> = {};
  public setWikiStartLockOn(id: string): void {
    this.justStartedWiki[id] = true;
  }

  public setAllWikiStartLockOff(): void {
    this.justStartedWiki = {};
  }

  public checkWikiStartLock(id: string): boolean {
    return this.justStartedWiki[id] ?? false;
  }

  public async wikiStartup(workspace: IWorkspace): Promise<void> {
    if (!isWikiWorkspace(workspace)) {
      return;
    }
    const { id, isSubWiki, name, mainWikiID } = workspace;

    const userName = await this.authService.getUserName(workspace);

    // if is main wiki
    if (isSubWiki) {
      // if is private repo wiki
      // if we are creating a sub-wiki just now, restart the main wiki to load content from private wiki
      if (typeof mainWikiID === 'string' && !this.checkWikiStartLock(mainWikiID)) {
        const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
        const mainWorkspace = await workspaceService.get(mainWikiID);
        if (mainWorkspace === undefined) {
          throw new SubWikiSMainWikiNotExistError(name ?? id, mainWikiID);
        }
        // Use restartWorkspaceViewService to restart wiki worker and reload frontend view
        const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
        await workspaceViewService.restartWorkspaceViewService(mainWikiID);
        // Log that main wiki restart is complete after creating sub-wiki
        logger.debug('[test-id-MAIN_WIKI_RESTARTED_AFTER_SUBWIKI] Main wiki restarted after sub-wiki creation', { mainWikiID, subWikiID: id });
      }
    } else {
      try {
        logger.debug('calling startWiki', {
          function: 'startWiki',
        });
        await this.startWiki(id, userName);
        logger.info('[test-id-WIKI_WORKER_STARTED] Wiki worker started successfully', {
          function: 'startWiki',
          workspaceId: id,
        });
      } catch (error) {
        logger.warn('startWiki failed', { function: 'startWiki', error });
        if (error instanceof WikiRuntimeError && error.retry) {
          logger.warn('startWiki retry', { function: 'startWiki', error });
          // don't want it to throw here again, so no await here.

          const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
          return workspaceViewService.restartWorkspaceViewService(id);
        } else if ((error as Error).message.includes('Did not receive an init message from worker after')) {
          // https://github.com/andywer/threads.js/issues/426
          // wait some time and restart the wiki will solve this
          logger.warn('startWiki handle error, restarting', { function: 'startWiki', error });
          await this.restartWiki(workspace);
        } else {
          logger.warn('unexpected error, throw it', { function: 'startWiki' });
          throw error;
        }
      }
    }
    const syncService = container.get<ISyncService>(serviceIdentifier.Sync);
    await syncService.startIntervalSyncIfNeeded(workspace);
  }

  public async restartWiki(workspace: IWorkspace): Promise<void> {
    if (!isWikiWorkspace(workspace)) {
      return;
    }
    const { id, isSubWiki } = workspace;
    // use workspace specific userName first, and fall back to preferences' userName, pass empty editor username if undefined

    const userName = await this.authService.getUserName(workspace);

    const syncService = container.get<ISyncService>(serviceIdentifier.Sync);
    syncService.stopIntervalSync(id);
    if (!isSubWiki) {
      await this.stopWiki(id);
      await this.startWiki(id, userName);
    }
    await syncService.startIntervalSyncIfNeeded(workspace);
  }

  public async wikiOperationInBrowser<OP extends keyof ISendWikiOperationsToBrowser>(
    operationType: OP,
    workspaceID: string,
    arguments_: Parameters<ISendWikiOperationsToBrowser[OP]>,
  ) {
    // At least wait for wiki started. Otherwise some services like theme may try to call this method even on app start.
    await this.getWorkerEnsure(workspaceID);
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    await viewService.getLoadedViewEnsure(workspaceID, WindowNames.main);
    const sendWikiOperationsToBrowser = getSendWikiOperationsToBrowser(workspaceID);
    if (typeof sendWikiOperationsToBrowser[operationType] !== 'function') {
      throw new TypeError(`${operationType} gets no useful handler`);
    }
    if (!Array.isArray(arguments_)) {
      throw new TypeError(`${JSON.stringify((arguments_ as unknown) ?? '')} (${typeof arguments_}) is not a good argument array for ${operationType}`);
    }
    // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.ts(2556) this maybe a bug of ts... try remove this comment after upgrade ts. And the result become void is weird too.

    return await (sendWikiOperationsToBrowser[operationType](...arguments_) as unknown as ReturnType<ISendWikiOperationsToBrowser[OP]>);
  }

  public async wikiOperationInServer<OP extends keyof IWorkerWikiOperations>(
    operationType: OP,
    workspaceID: string,
    arguments_: Parameters<IWorkerWikiOperations[OP]>,
  ) {
    logger.debug(`Get ${operationType}`, { workspaceID, method: 'wikiOperationInServer' });
    // This will never await if workspaceID isn't exist in user's workspace list. So prefer to check workspace existence before use this method.
    const worker = await this.getWorkerEnsure(workspaceID);

    logger.debug(`Get worker ${operationType}`, { workspaceID, hasWorker: worker !== undefined, method: 'wikiOperationInServer', arguments_ });
    const result = await (worker.wikiOperation(operationType, ...arguments_) as unknown as ReturnType<IWorkerWikiOperations[OP]>);
    logger.debug(`Get result ${operationType}`, { workspaceID, method: 'wikiOperationInServer' });
    return result;
  }

  public async setWikiLanguage(workspaceID: string, tiddlywikiLanguageName: string): Promise<void> {
    const twLanguageUpdateTimeout = 15_000;
    // no need to wait setting wiki language, this sometimes cause slow PC to fail on this step
    void backOff(async () => {
      await (this.wikiOperationInBrowser(
        WikiChannel.setTiddlerText,
        workspaceID,
        ['$:/language', tiddlywikiLanguageName, { timeout: twLanguageUpdateTimeout }],
      ));
    }, {
      startingDelay: 2000,
    });
  }

  public async getTiddlerFilePath(title: string, workspaceID?: string): Promise<string | undefined> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiWorker = this.getWorker(workspaceID ?? (await workspaceService.getActiveWorkspace())?.id ?? '');
    if (wikiWorker !== undefined) {
      const tiddlerFileMetadata = await wikiWorker.getTiddlerFileMetadata(title);
      if (tiddlerFileMetadata?.filepath !== undefined) {
        return tiddlerFileMetadata.filepath;
      }
    }
  }

  public async getWikiErrorLogs(_workspaceID: string, wikiName: string): Promise<{ content: string; filePath: string }> {
    // All logs (including errors) are now in the labeled logger file
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFileName = `${wikiName}-${today}.log`;
    const filePath = path.join(LOG_FOLDER, logFileName);

    try {
      const content = await readFile(filePath, 'utf8');
      return {
        content,
        filePath,
      };
    } catch (error) {
      // Log file doesn't exist yet or can't be read
      return {
        content: 'Unexpected error:' + JSON.stringify(serializeError(error)),
        filePath,
      };
    }
  }
}
