import { app, dialog, powerMonitor } from 'electron';
import { copy, pathExists, remove } from 'fs-extra';
import { inject, injectable } from 'inversify';
import path from 'path';

import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import type { INotificationService } from '@services/notifications/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { INewWikiWorkspaceConfig, IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

import { DEFAULT_FIRST_WIKI_FOLDER_PATH, DEFAULT_FIRST_WIKI_PATH } from '@/constants/paths';
import type { IContextService } from '@services/context/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { ISyncService } from '@services/sync/interface';
import { SupportedStorageServices } from '@services/types';
import { updateGhConfig } from '@services/wiki/plugin/ghPages';
import { hasGit } from 'git-sync-js';
import { InitWikiGitError, InitWikiGitRevertError, InitWikiGitSyncedWikiNoGitUserInfoError } from './error';
import type { IWikiGitWorkspaceService } from './interface';

@injectable()
export class WikiGitWorkspace implements IWikiGitWorkspaceService {
  constructor(
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.Context) private readonly contextService: IContextService,
    @inject(serviceIdentifier.NotificationService) private readonly notificationService: INotificationService,
  ) {
  }

  public registerSyncBeforeShutdown(): void {
    const listener = async (): Promise<void> => {
      try {
        if (await this.contextService.isOnline()) {
          const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
          const workspaces = await workspaceService.getWorkspacesAsList();
          const workspacesToSync = workspaces.filter((workspace) =>
            isWikiWorkspace(workspace) &&
            workspace.storageService !== SupportedStorageServices.local &&
            !workspace.hibernated
          );
          await Promise.allSettled([
            this.notificationService.show({ title: i18n.t('Preference.SyncBeforeShutdown') }),
            ...workspacesToSync.map(async (workspace) => {
              if (!isWikiWorkspace(workspace)) return;
              if (workspace.readOnlyMode) {
                return;
              }
              await container.get<ISyncService>(serviceIdentifier.Sync).syncWikiIfNeeded(workspace);
            }),
          ]);
        }
      } catch (error_: unknown) {
        const error = error_ as Error;
        logger.error(`SyncBeforeShutdown failed`, { error });
      } finally {
        app.quit();
      }
    };
    // only on linux,darwin, and can't prevent default
    powerMonitor.addListener('shutdown', listener);
  }

  public initWikiGitTransaction = async (newWorkspaceConfig: INewWikiWorkspaceConfig, userInfo?: IGitUserInfos): Promise<IWorkspace | undefined> => {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const newWorkspace = await workspaceService.create(newWorkspaceConfig);
    if (!isWikiWorkspace(newWorkspace)) {
      throw new Error('initWikiGitTransaction can only be called with wiki workspaces');
    }
    const { gitUrl, storageService, wikiFolderLocation, isSubWiki, id: workspaceID, mainWikiToLink } = newWorkspace;
    try {
      const previousActiveId = workspaceService.getActiveWorkspaceSync()?.id;
      await workspaceService.setActiveWorkspace(newWorkspace.id, previousActiveId);
      const isSyncedWiki = storageService !== SupportedStorageServices.local;
      if (await hasGit(wikiFolderLocation)) {
        logger.warn('Skip git init because it already has a git setup.', { wikiFolderLocation });
      } else {
        if (isSyncedWiki) {
          if (typeof gitUrl === 'string' && userInfo !== undefined) {
            const gitService = container.get<IGitService>(serviceIdentifier.Git);
            await gitService.initWikiGit(wikiFolderLocation, isSyncedWiki, !isSubWiki, gitUrl, userInfo);
            const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
            const branch = await authService.get(`${storageService}-branch`);
            if (branch !== undefined) {
              await updateGhConfig(wikiFolderLocation, { branch });
            }
          } else {
            throw new InitWikiGitSyncedWikiNoGitUserInfoError(gitUrl, userInfo);
          }
        } else {
          const gitService = container.get<IGitService>(serviceIdentifier.Git);
          await gitService.initWikiGit(wikiFolderLocation, false);
        }
      }
      return newWorkspace;
    } catch (error_: unknown) {
      // prepare to rollback changes
      const error = error_ as Error;
      const errorMessage = `initWikiGitTransaction failed, ${error.message} ${error.stack ?? ''}`;
      logger.error(errorMessage);
      const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      await workspaceService.remove(workspaceID);
      try {
        if (!isSubWiki) {
          await wikiService.removeWiki(wikiFolderLocation);
        } else if (typeof mainWikiToLink === 'string') {
          await wikiService.removeWiki(wikiFolderLocation, mainWikiToLink);
        }
      } catch (error_: unknown) {
        throw new InitWikiGitRevertError(String(error_));
      }
      throw new InitWikiGitError(errorMessage);
    }
  };

  /**
   * Automatically initialize a default wiki workspace if none exists. This matches the previous frontend logic.
   */
  public async initialize(): Promise<void> {
    logger.info('checking for default wiki workspace', { function: 'WikiGitWorkspace.initialize' });
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspaces = await workspaceService.getWorkspacesAsList();
    const wikiWorkspaces = workspaces.filter(w => isWikiWorkspace(w) && !w.isSubWiki);
    logger.info(`Found ${wikiWorkspaces.length} existing wiki workspaces`, {
      wikiWorkspaces: wikiWorkspaces.map(w => w.id),
      function: 'WikiGitWorkspace.initialize',
    });
    if (wikiWorkspaces.length > 0) {
      logger.info('Skipping default workspace creation - workspaces already exist', {
        function: 'WikiGitWorkspace.initialize',
      });
      return;
    }
    // Construct minimal default config, only fill required fields, let workspaceService.create handle defaults
    const defaultConfig: INewWikiWorkspaceConfig = {
      order: 0,
      wikiFolderLocation: DEFAULT_FIRST_WIKI_PATH,
      storageService: SupportedStorageServices.local,
      name: 'wiki',
      port: 5212,
      isSubWiki: false,
      backupOnInterval: true,
      readOnlyMode: false,
      tokenAuth: false,
      tagName: null,
      mainWikiToLink: null,
      mainWikiID: null,
      excludedPlugins: [],
      enableHTTPAPI: false,
      enableFileSystemWatch: true,
      includeTagTree: false,
      lastNodeJSArgv: [],
      homeUrl: '',
      gitUrl: null,
    };
    try {
      logger.info('Starting default wiki creation', {
        config: {
          name: defaultConfig.name,
          port: defaultConfig.port,
          path: defaultConfig.wikiFolderLocation,
        },
        function: 'WikiGitWorkspace.initialize',
      });
      // Copy the wiki template first
      logger.info('Copying wiki template...', {
        from: 'TIDDLYWIKI_TEMPLATE_FOLDER',
        to: DEFAULT_FIRST_WIKI_PATH,
        function: 'WikiGitWorkspace.initialize',
      });
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      await wikiService.copyWikiTemplate(DEFAULT_FIRST_WIKI_FOLDER_PATH, 'wiki');
      logger.info('Wiki template copied successfully', {
        path: DEFAULT_FIRST_WIKI_PATH,
        function: 'WikiGitWorkspace.initialize',
      });
      // Create the workspace
      logger.info('Initializing wiki git transaction...', {
        function: 'WikiGitWorkspace.initialize',
      });
      await this.initWikiGitTransaction(defaultConfig);
      logger.info('Default wiki workspace created successfully', {
        function: 'WikiGitWorkspace.initialize',
      });
    } catch (error_: unknown) {
      const error = error_ as Error;
      logger.error('Failed to create default wiki workspace', {
        error,
        function: 'WikiGitWorkspace.initialize',
      });
    }
  }

  public async removeWorkspace(workspaceID: string): Promise<void> {
    const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
    if (mainWindow !== undefined) {
      const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
      const workspace = await workspaceService.get(workspaceID);
      if (workspace === undefined) {
        throw new Error(`Need to get workspace with id ${workspaceID} but failed`);
      }
      if (!isWikiWorkspace(workspace)) {
        throw new Error('removeWikiGitTransaction can only be called with wiki workspaces');
      }
      const { isSubWiki, mainWikiToLink, wikiFolderLocation, id, name } = workspace;
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: [i18n.t('WorkspaceSelector.RemoveWorkspace'), i18n.t('WorkspaceSelector.RemoveWorkspaceAndDelete'), i18n.t('Cancel')],
        message: `${i18n.t('EditWorkspace.Name')} ${name} ${isSubWiki ? i18n.t('EditWorkspace.IsSubWorkspace') : ''} ${i18n.t('WorkspaceSelector.AreYouSure')}`,
        cancelId: 2,
      });
      try {
        const removeWorkspaceAndDelete = response === 1;
        const onlyRemoveWorkspace = response === 0;
        if (!onlyRemoveWorkspace && !removeWorkspaceAndDelete) {
          return;
        }
        const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
        const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
        await wikiService.stopWiki(id).catch((error_: unknown) => {
          const error = error_ as Error;
          logger.error(error.message, { error });
        });
        if (isSubWiki) {
          if (mainWikiToLink === null) {
            throw new Error(`workspace.mainWikiToLink is null in WikiGitWorkspace.removeWorkspace ${JSON.stringify(workspace)}`);
          }
          await wikiService.removeWiki(wikiFolderLocation, mainWikiToLink, onlyRemoveWorkspace);
          // Sub-wiki configuration is now handled by FileSystemAdaptor in watch-filesystem plugin
        } else {
          // is main wiki, also delete all sub wikis
          const subWikis = workspaceService.getSubWorkspacesAsListSync(id);
          await Promise.all(subWikis.map(async (subWiki) => {
            await this.removeWorkspace(subWiki.id);
          }));
          if (removeWorkspaceAndDelete) {
            await wikiService.removeWiki(wikiFolderLocation);
          }
        }
        await container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).removeWorkspaceView(workspaceID);
        await workspaceService.remove(workspaceID);
        // switch to first workspace
        const firstWorkspace = await workspaceService.getFirstWorkspace();
        if (firstWorkspace !== undefined) {
          await container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).setActiveWorkspaceView(firstWorkspace.id);
        }
      } catch (error_: unknown) {
        const error = error_ as Error;
        logger.error(error.message, { error });
      }
    }
  }

  public async moveWorkspaceLocation(workspaceID: string, newParentLocation: string): Promise<void> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspace = await workspaceService.get(workspaceID);
    if (workspace === undefined) {
      throw new Error(`Need to get workspace with id ${workspaceID} but failed`);
    }
    if (!isWikiWorkspace(workspace)) {
      throw new Error('moveWorkspaceLocation can only be called with wiki workspaces');
    }

    const { wikiFolderLocation, name } = workspace;
    const wikiFolderName = path.basename(wikiFolderLocation);
    const newWikiFolderLocation = path.join(newParentLocation, wikiFolderName);

    if (!(await pathExists(wikiFolderLocation))) {
      throw new Error(`Source wiki folder does not exist: ${wikiFolderLocation}`);
    }
    if (await pathExists(newWikiFolderLocation)) {
      throw new Error(`Target location already exists: ${newWikiFolderLocation}`);
    }

    try {
      logger.info(`Moving workspace ${name} from ${wikiFolderLocation} to ${newWikiFolderLocation}`);

      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      await wikiService.stopWiki(workspaceID).catch((error_: unknown) => {
        const error = error_ as Error;
        logger.error(`Failed to stop wiki before move: ${error.message}`, { error });
      });

      await copy(wikiFolderLocation, newWikiFolderLocation, {
        overwrite: false,
        errorOnExist: true,
      });

      await workspaceService.update(workspaceID, {
        wikiFolderLocation: newWikiFolderLocation,
      });

      logger.info(`Successfully moved workspace to ${newWikiFolderLocation} [test-id-WORKSPACE_MOVED:${newWikiFolderLocation}]`);
      // Restart the workspace view to load from new location
      const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
      await workspaceViewService.restartWorkspaceViewService(workspaceID);

      logger.debug(`Workspace view restarted after move [test-id-WORKSPACE_RESTARTED_AFTER_MOVE:${workspaceID}]`);
      // Only delete old folder after successful restart to avoid inconsistent state
      await remove(wikiFolderLocation);
    } catch (error_: unknown) {
      const error = error_ as Error;
      logger.error(`Failed to move workspace: ${error.message}`, { error });
      throw error;
    }
  }
}
