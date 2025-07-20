import { app, dialog, powerMonitor } from 'electron';
import { injectable } from 'inversify';

import type { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import type { INotificationService } from '@services/notifications/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { INewWikiWorkspaceConfig, IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

import { DEFAULT_FIRST_WIKI_PATH, DEFAULT_WIKI_FOLDER } from '@/constants/paths';
import { IContextService } from '@services/context/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import { ISyncService } from '@services/sync/interface';
import { SupportedStorageServices } from '@services/types';
import { updateGhConfig } from '@services/wiki/plugin/ghPages';
import { hasGit } from 'git-sync-js';
import { InitWikiGitError, InitWikiGitRevertError, InitWikiGitSyncedWikiNoGitUserInfoError } from './error';
import { IWikiGitWorkspaceService } from './interface';

@injectable()
export class WikiGitWorkspace implements IWikiGitWorkspaceService {
  @lazyInject(serviceIdentifier.Authentication)
  private readonly authService!: IAuthenticationService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.Git)
  private readonly gitService!: IGitService;

  @lazyInject(serviceIdentifier.Context)
  private readonly contextService!: IContextService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  @lazyInject(serviceIdentifier.NotificationService)
  private readonly notificationService!: INotificationService;

  @lazyInject(serviceIdentifier.Sync)
  private readonly syncService!: ISyncService;

  public registerSyncBeforeShutdown(): void {
    const listener = async (): Promise<void> => {
      try {
        if (await this.contextService.isOnline()) {
          const workspaces = await this.workspaceService.getWorkspacesAsList();
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
              await this.syncService.syncWikiIfNeeded(workspace);
            }),
          ]);
        }
      } catch (error) {
        logger.error(`SyncBeforeShutdown failed`, { error });
      } finally {
        app.quit();
      }
    };
    // only on linux,darwin, and can't prevent default
    powerMonitor.addListener('shutdown', listener);
  }

  public initWikiGitTransaction = async (newWorkspaceConfig: INewWikiWorkspaceConfig, userInfo?: IGitUserInfos): Promise<IWorkspace | undefined> => {
    const newWorkspace = await this.workspaceService.create(newWorkspaceConfig);
    if (!isWikiWorkspace(newWorkspace)) {
      throw new Error('initWikiGitTransaction can only be called with wiki workspaces');
    }
    const { gitUrl, storageService, wikiFolderLocation, isSubWiki, id: workspaceID, mainWikiToLink } = newWorkspace;
    try {
      await this.workspaceService.setActiveWorkspace(newWorkspace.id, this.workspaceService.getActiveWorkspaceSync()?.id);
      const isSyncedWiki = storageService !== SupportedStorageServices.local;
      if (await hasGit(wikiFolderLocation)) {
        logger.warn('Skip git init because it already has a git setup.', { wikiFolderLocation });
      } else {
        if (isSyncedWiki) {
          if (typeof gitUrl === 'string' && userInfo !== undefined) {
            await this.gitService.initWikiGit(wikiFolderLocation, isSyncedWiki, !isSubWiki, gitUrl, userInfo);
            const branch = await this.authService.get(`${storageService}-branch`);
            if (branch !== undefined) {
              await updateGhConfig(wikiFolderLocation, { branch });
            }
          } else {
            throw new InitWikiGitSyncedWikiNoGitUserInfoError(gitUrl, userInfo);
          }
        } else {
          await this.gitService.initWikiGit(wikiFolderLocation, false);
        }
      }
      return newWorkspace;
    } catch (error) {
      // prepare to rollback changes
      const errorMessage = `initWikiGitTransaction failed, ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      logger.error(errorMessage);
      await this.workspaceService.remove(workspaceID);
      try {
        if (!isSubWiki) {
          await this.wikiService.removeWiki(wikiFolderLocation);
        } else if (typeof mainWikiToLink === 'string') {
          await this.wikiService.removeWiki(wikiFolderLocation, mainWikiToLink);
        }
      } catch (error_) {
        throw new InitWikiGitRevertError((error_ as Error).message);
      }
      throw new InitWikiGitError(errorMessage);
    }
  };

  /**
   * Automatically initialize a default wiki workspace if none exists. This matches the previous frontend logic.
   */
  public async initialize(): Promise<void> {
    const workspaces = await this.workspaceService.getWorkspacesAsList();
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
    // Copy the wiki template first
    await this.wikiService.copyWikiTemplate(DEFAULT_WIKI_FOLDER, 'wiki');
    // Create the workspace
    await this.initWikiGitTransaction(defaultConfig);
  }

  public async removeWorkspace(workspaceID: string): Promise<void> {
    const mainWindow = this.windowService.get(WindowNames.main);
    if (mainWindow !== undefined) {
      const workspace = await this.workspaceService.get(workspaceID);
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
        await this.wikiService.stopWiki(id).catch((error: Error) => logger.error(error.message, error));
        if (isSubWiki) {
          if (mainWikiToLink === null) {
            throw new Error(`workspace.mainWikiToLink is null in WikiGitWorkspace.removeWorkspace ${JSON.stringify(workspace)}`);
          }
          await this.wikiService.removeWiki(wikiFolderLocation, mainWikiToLink, onlyRemoveWorkspace);
          // remove folderName from fileSystemPaths
          await this.wikiService.updateSubWikiPluginContent(mainWikiToLink, wikiFolderLocation, undefined, workspace);
        } else {
          // is main wiki, also delete all sub wikis
          const subWikis = this.workspaceService.getSubWorkspacesAsListSync(id);
          await Promise.all(subWikis.map(async (subWiki) => {
            await this.removeWorkspace(subWiki.id);
          }));
          if (removeWorkspaceAndDelete) {
            await this.wikiService.removeWiki(wikiFolderLocation);
          }
        }
        await this.workspaceViewService.removeWorkspaceView(workspaceID);
        await this.workspaceService.remove(workspaceID);
        // switch to first workspace
        const firstWorkspace = await this.workspaceService.getFirstWorkspace();
        if (firstWorkspace !== undefined) {
          await this.workspaceViewService.setActiveWorkspaceView(firstWorkspace.id);
        }
      } catch (error) {
        logger.error((error as Error).message, error);
      }
    }
  }
}
