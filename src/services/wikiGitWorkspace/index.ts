import { app, dialog, powerMonitor } from 'electron';
import { inject, injectable } from 'inversify';

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
      } catch (_error: unknown) {
        const error = _error instanceof Error ? _error : new Error(String(_error));
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
    } catch (_error: unknown) {
      // prepare to rollback changes
      const error = _error instanceof Error ? _error : new Error(String(_error));
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
      } catch (_error_) {
        const error_ = _error_ instanceof Error ? _error_ : new Error(String(_error_));
        throw new InitWikiGitRevertError(error_.message);
      }
      throw new InitWikiGitError(errorMessage);
    }
  };

  /**
   * Automatically initialize a default wiki workspace if none exists. This matches the previous frontend logic.
   */
  public async initialize(): Promise<void> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspaces = await workspaceService.getWorkspacesAsList();
    const wikiWorkspaces = workspaces.filter(w => isWikiWorkspace(w) && !w.isSubWiki);
    if (wikiWorkspaces.length > 0) return;
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
      lastNodeJSArgv: [],
      homeUrl: '',
      gitUrl: null,
    };
    try {
      // Copy the wiki template first
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      await wikiService.copyWikiTemplate(DEFAULT_FIRST_WIKI_FOLDER_PATH, 'wiki');
      // Create the workspace
      await this.initWikiGitTransaction(defaultConfig);
    } catch (_error: unknown) {
      const error = _error instanceof Error ? _error : new Error(String(_error));
      logger.error(error.message, error);
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
        await wikiService.stopWiki(id).catch((_error: unknown) => {
          const error = _error instanceof Error ? _error : new Error(String(_error));
          logger.error(error.message, error);
        });
        if (isSubWiki) {
          if (mainWikiToLink === null) {
            throw new Error(`workspace.mainWikiToLink is null in WikiGitWorkspace.removeWorkspace ${JSON.stringify(workspace)}`);
          }
          await wikiService.removeWiki(wikiFolderLocation, mainWikiToLink, onlyRemoveWorkspace);
          // remove folderName from fileSystemPaths
          await wikiService.updateSubWikiPluginContent(mainWikiToLink, wikiFolderLocation, undefined, workspace);
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
      } catch (_error: unknown) {
        const error = _error instanceof Error ? _error : new Error(String(_error));
        logger.error(error.message, error);
      }
    }
  }
}
