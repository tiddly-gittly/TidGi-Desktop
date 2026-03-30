import { inject, injectable } from 'inversify';

import { WikiChannel } from '@/constants/channels';
import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { ICommitAndSyncConfigs, IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { ISyncOptions, ISyncService } from './interface';

@injectable()
export class Sync implements ISyncService {
  constructor(
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
  }

  public async syncWikiIfNeeded(workspace: IWorkspace, options?: ISyncOptions): Promise<void> {
    if (!isWikiWorkspace(workspace)) {
      logger.warn('syncWikiIfNeeded called on non-wiki workspace', { workspaceId: workspace.id });
      return;
    }
    logger.info('syncWikiIfNeeded started', { workspaceId: workspace.id, storageService: workspace.storageService, force: options?.force });

    // Get Layer 3 services
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const gitService = container.get<IGitService>(serviceIdentifier.Git);
    const viewService = container.get<IViewService>(serviceIdentifier.View);
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);

    const { gitUrl, storageService, id, isSubWiki, wikiFolderLocation } = workspace;
    const userInfo = await this.authService.getStorageServiceUserInfo(storageService);
    const { commitMessage: overrideCommitMessage, useAICommitMessage = false } = options ?? {};

    const defaultCommitMessage = i18n.t('LOG.CommitMessage');
    const commitMessage = useAICommitMessage ? undefined : (overrideCommitMessage ?? defaultCommitMessage);
    const localCommitMessage = useAICommitMessage ? undefined : overrideCommitMessage;
    const syncOnlyWhenNoDraft = await this.preferenceService.get('syncOnlyWhenNoDraft');
    const mainWorkspace = isSubWiki ? workspaceService.getMainWorkspace(workspace) : undefined;
    if (isSubWiki && mainWorkspace === undefined) {
      logger.error(`Main workspace not found for sub workspace ${id}`, { function: 'syncWikiIfNeeded' });
      return;
    }
    const idToUse = isSubWiki ? mainWorkspace!.id : id;
    const { force = false } = options ?? {};
    // we can only run filter on main wiki (tw don't know what is sub-wiki)
    // Skip draft check when user explicitly triggers sync (force=true), or when syncOnlyWhenNoDraft is disabled.
    if (!force && syncOnlyWhenNoDraft && !(await this.checkCanSyncDueToNoDraft(idToUse))) {
      await wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, idToUse, [i18n.t('Preference.SyncOnlyWhenNoDraft')]);
      return;
    }
    if (storageService === SupportedStorageServices.local) {
      // for local workspace, commitOnly, no sync and no force pull.
      await gitService.commitAndSync(workspace, { dir: wikiFolderLocation, commitOnly: true, commitMessage: localCommitMessage });
    } else if (
      typeof gitUrl === 'string' &&
      userInfo !== undefined
    ) {
      // cloud workspace with valid auth: full sync
      const syncOrForcePullConfigs = { remoteUrl: gitUrl, userInfo, dir: wikiFolderLocation, commitMessage } satisfies ICommitAndSyncConfigs;
      // sync current workspace first
      const hasChanges = await gitService.syncOrForcePull(workspace, syncOrForcePullConfigs);
      if (isSubWiki) {
        // after sync this sub wiki, reload its main workspace
        // Skip restart if file system watch is enabled - the watcher will handle file changes automatically
        if (hasChanges && !workspace.enableFileSystemWatch) {
          await workspaceViewService.restartWorkspaceViewService(idToUse);
          await viewService.reloadViewsWebContents(idToUse);
        }
      } else if (workspace.syncSubWikis !== false) {
        // sync all sub workspace (can be disabled via syncSubWikis setting)
        const subWorkspaces = await workspaceService.getSubWorkspacesAsList(id);
        const subHasChangesPromise = subWorkspaces.map(async (subWorkspace) => {
          if (!isWikiWorkspace(subWorkspace)) return false;
          const { gitUrl: subGitUrl, storageService: subStorageService, wikiFolderLocation: subGitFolderLocation } = subWorkspace;

          if (!subGitUrl) return false;
          const subUserInfo = await this.authService.getStorageServiceUserInfo(subStorageService);
          const hasChanges = await gitService.syncOrForcePull(subWorkspace, {
            remoteUrl: subGitUrl,
            userInfo: subUserInfo,
            dir: subGitFolderLocation,
            commitMessage,
          });
          return hasChanges;
        });
        const subHasChange = (await Promise.all(subHasChangesPromise)).some(Boolean);
        // any of main or sub has changes, reload main workspace
        // Skip restart if file system watch is enabled - the watcher will handle file changes automatically
        if ((hasChanges || subHasChange) && !workspace.enableFileSystemWatch) {
          await workspaceViewService.restartWorkspaceViewService(id);
          await viewService.reloadViewsWebContents(id);
        }
      }
    } else {
      // cloud workspace but missing gitUrl or userInfo - log and notify instead of silently doing nothing
      const reason = typeof gitUrl !== 'string' ? 'missing gitUrl' : 'missing userInfo (not authenticated)';
      logger.warn('syncWikiIfNeeded skipped for cloud workspace', { workspaceId: id, reason });
      await wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, idToUse, [
        `${i18n.t('Log.SynchronizationFailed')} (${reason})`,
      ]);
    }
  }

  public async checkCanSyncDueToNoDraft(workspaceID: string): Promise<boolean> {
    try {
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      // Add timeout so the sync flow doesn't hang forever when the wiki browser view is unresponsive
      const DRAFT_CHECK_TIMEOUT_MS = 5000;
      const draftCheckPromise = Promise.all([
        wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, ['[all[]is[draft]]']),
        wikiService.wikiOperationInBrowser(WikiChannel.runFilter, workspaceID, ['[list[$:/StoryList]has:field[wysiwyg]]']),
      ]);
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('checkCanSyncDueToNoDraft timed out'));
        }, DRAFT_CHECK_TIMEOUT_MS);
      });
      const draftTitles = (await Promise.race([draftCheckPromise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutHandle);
      })).flat();

      if (Array.isArray(draftTitles) && draftTitles.length > 0) {
        return false;
      }
      return true;
    } catch (error) {
      const error_ = error as Error;
      logger.error('Error when checking draft titles', { error: error_, function: 'checkCanSyncDueToNoDraft' });
      // when app is on background, might have no draft, because user won't edit it. So just return true
      return true;
    }
  }

  /**
   * Record<workspaceID, returnValue<setInterval>>
   * Set this in wikiStartup, and clear it when wiki is down.
   */
  private wikiSyncIntervals: Record<string, ReturnType<typeof setInterval>> = {};
  /**
   * Trigger git sync interval if needed in config
   */
  public async startIntervalSyncIfNeeded(workspace: IWorkspace): Promise<void> {
    if (!isWikiWorkspace(workspace)) {
      return;
    }
    const { syncOnInterval, backupOnInterval, id } = workspace;
    // Clear existing interval first to avoid duplicates when settings are updated
    this.stopIntervalSync(id);

    if (syncOnInterval || backupOnInterval) {
      const syncDebounceInterval = await this.preferenceService.get('syncDebounceInterval');
      this.wikiSyncIntervals[id] = setInterval(async () => {
        // Source will be tracked as 'sync' or 'backup' depending on settings
        await this.syncWikiIfNeeded(workspace);
      }, syncDebounceInterval);
    }
  }

  public stopIntervalSync(workspaceID: string): void {
    if (typeof this.wikiSyncIntervals[workspaceID] === 'number') {
      clearInterval(this.wikiSyncIntervals[workspaceID]);
    }
  }

  public clearAllSyncIntervals(): void {
    Object.values(this.wikiSyncIntervals).forEach((interval) => {
      clearInterval(interval);
    });
  }
}
