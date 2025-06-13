/* eslint-disable unicorn/prevent-abbreviations */
import { injectable } from 'inversify';

import { WikiChannel } from '@/constants/channels';
import type { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';
import { ICommitAndSyncConfigs, IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import { IWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import { IWorkspaceViewService } from '@services/workspacesView/interface';
import { ISyncService } from './interface';

@injectable()
export class Sync implements ISyncService {
  @lazyInject(serviceIdentifier.Authentication)
  private readonly authService!: IAuthenticationService;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.View)
  private readonly viewService!: IViewService;

  @lazyInject(serviceIdentifier.Git)
  private readonly gitService!: IGitService;

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  public async syncWikiIfNeeded(workspace: IWorkspace): Promise<void> {
    const { gitUrl, storageService, id, isSubWiki, wikiFolderLocation: dir } = workspace;
    const userInfo = await this.authService.getStorageServiceUserInfo(storageService);
    const defaultCommitMessage = i18n.t('LOG.CommitMessage');
    const defaultCommitBackupMessage = i18n.t('LOG.CommitBackupMessage');
    const syncOnlyWhenNoDraft = await this.preferenceService.get('syncOnlyWhenNoDraft');
    const mainWorkspace = isSubWiki ? this.workspaceService.getMainWorkspace(workspace) : undefined;
    if (isSubWiki && mainWorkspace === undefined) {
      logger.error(`Main workspace not found for sub workspace ${id}`, { function: 'syncWikiIfNeeded' });
      return;
    }
    const idToUse = isSubWiki ? mainWorkspace!.id : id;
    // we can only run filter on main wiki (tw don't know what is sub-wiki)
    if (syncOnlyWhenNoDraft && !(await this.checkCanSyncDueToNoDraft(idToUse))) {
      await this.wikiService.wikiOperationInBrowser(WikiChannel.generalNotification, idToUse, [i18n.t('Preference.SyncOnlyWhenNoDraft')]);
      return;
    }
    if (storageService === SupportedStorageServices.local) {
      // for local workspace, commitOnly, no sync and no force pull.
      await this.gitService.commitAndSync(workspace, { commitOnly: true, dir, commitMessage: defaultCommitBackupMessage });
    } else if (
      typeof gitUrl === 'string' &&
      userInfo !== undefined
    ) {
      const syncOrForcePullConfigs = { remoteUrl: gitUrl, userInfo, dir, commitMessage: defaultCommitMessage } satisfies ICommitAndSyncConfigs;
      // sync current workspace first
      const hasChanges = await this.gitService.syncOrForcePull(workspace, syncOrForcePullConfigs);
      if (isSubWiki) {
        // after sync this sub wiki, reload its main workspace
        if (hasChanges) {
          await this.workspaceViewService.restartWorkspaceViewService(idToUse);
          await this.viewService.reloadViewsWebContents(idToUse);
        }
      } else {
        // sync all sub workspace
        const subWorkspaces = await this.workspaceService.getSubWorkspacesAsList(id);
        const subHasChangesPromise = subWorkspaces.map(async (subWorkspace) => {
          const { gitUrl: subGitUrl, storageService: subStorageService, wikiFolderLocation: subGitDir } = subWorkspace;

          if (!subGitUrl) return false;
          const subUserInfo = await this.authService.getStorageServiceUserInfo(subStorageService);
          const hasChanges = await this.gitService.syncOrForcePull(subWorkspace, {
            remoteUrl: subGitUrl,
            userInfo: subUserInfo,
            dir: subGitDir,
            commitMessage: defaultCommitMessage,
          });
          return hasChanges;
        });
        const subHasChange = (await Promise.all(subHasChangesPromise)).some(Boolean);
        // any of main or sub has changes, reload main workspace
        if (hasChanges || subHasChange) {
          await this.workspaceViewService.restartWorkspaceViewService(id);
          await this.viewService.reloadViewsWebContents(id);
        }
      }
    }
  }

  public async checkCanSyncDueToNoDraft(workspaceID: string): Promise<boolean> {
    try {
      const draftTitles = (await Promise.all([
        this.wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, ['[all[]is[draft]]']),
        this.wikiService.wikiOperationInBrowser(WikiChannel.runFilter, workspaceID, ['[list[$:/StoryList]has:field[wysiwyg]]']),
      ])).flat();

      if (Array.isArray(draftTitles) && draftTitles.length > 0) {
        return false;
      }
      return true;
    } catch (error) {
      logger.error(
        `${(error as Error).message} when checking draft titles. ${
          (error as Error).stack ?? ''
        }\n This might because it just will throw error when on Windows and App is at background (WebContentsView will disappear and not accessible.)`,
      );
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
    const { syncOnInterval, backupOnInterval, id } = workspace;
    if (syncOnInterval || backupOnInterval) {
      const syncDebounceInterval = await this.preferenceService.get('syncDebounceInterval');
      this.wikiSyncIntervals[id] = setInterval(async () => {
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
