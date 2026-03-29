import type { IGitService } from '@services/git/interface';
import { DeferredMenuItemConstructorOptions } from '@services/menu/interface';
import type { ISyncService } from '@services/sync/interface';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { TFunction } from 'i18next';

/**
 * Create backup menu items for a workspace (for menubar - returns DeferredMenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param gitService Git service instance - used directly for commitOnly backup to avoid requiring auth
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @returns Array of menu items
 */
export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
): DeferredMenuItemConstructorOptions[];

/**
 * Create backup menu items for a workspace (for context menu - returns MenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param gitService Git service instance - used directly for commitOnly backup to avoid requiring auth
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @param useDeferred Set to false for context menu
 * @returns Array of menu items
 */
export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
  useDeferred: false,
): import('electron').MenuItemConstructorOptions[];

export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
  _useDeferred: boolean = true,
): DeferredMenuItemConstructorOptions[] | import('electron').MenuItemConstructorOptions[] {
  if (!isWikiWorkspace(workspace)) {
    return [];
  }

  // Use gitService.commitAndSync directly with commitOnly:true so backup works for both local and
  // cloud workspaces without requiring remote auth (local backup = just git commit, no push).
  const baseItem = {
    label: aiEnabled ? t('ContextMenu.BackupNow') + t('ContextMenu.WithAI') : t('ContextMenu.BackupNow'),
    click: async () => {
      if (aiEnabled) {
        // Omit commitMessage to let commitAndSync trigger AI generation
        await gitService.commitAndSync(workspace, { dir: workspace.wikiFolderLocation, commitOnly: true });
      } else {
        await gitService.commitAndSync(workspace, { dir: workspace.wikiFolderLocation, commitOnly: true, commitMessage: t('LOG.CommitBackupMessage') });
      }
    },
  };

  return [baseItem];
}

/**
 * Create sync menu items for a workspace (for menubar - returns DeferredMenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param syncService Sync service instance (or Pick with syncWikiIfNeeded)
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @param isOnline Whether the network is online (optional, defaults to true)
 * @returns Array of menu items
 */
export function createSyncMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  syncService: Pick<ISyncService, 'syncWikiIfNeeded'>,
  aiEnabled: boolean,
  isOnline: boolean,
): DeferredMenuItemConstructorOptions[];

/**
 * Create sync menu items for a workspace (for context menu - returns MenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param syncService Sync service instance (or Pick with syncWikiIfNeeded)
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @param isOnline Whether the network is online (optional, defaults to true)
 * @param useDeferred Set to false for context menu
 * @returns Array of menu items
 */
export function createSyncMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  syncService: Pick<ISyncService, 'syncWikiIfNeeded'>,
  aiEnabled: boolean,
  isOnline: boolean,
  useDeferred: false,
): import('electron').MenuItemConstructorOptions[];

export function createSyncMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  syncService: Pick<ISyncService, 'syncWikiIfNeeded'>,
  aiEnabled: boolean,
  isOnline: boolean,
  _useDeferred: boolean = true,
): DeferredMenuItemConstructorOptions[] | import('electron').MenuItemConstructorOptions[] {
  if (!isWikiWorkspace(workspace) || !workspace.gitUrl) {
    return [];
  }

  const offlineText = isOnline ? '' : ` (${t('ContextMenu.NoNetworkConnection')})`;
  const label = aiEnabled
    ? t('ContextMenu.SyncNow') + t('ContextMenu.WithAI') + offlineText
    : t('ContextMenu.SyncNow') + offlineText;

  return [
    {
      label,
      enabled: isOnline,
      click: async () => {
        if (aiEnabled) {
          await syncService.syncWikiIfNeeded(workspace, { useAICommitMessage: true, force: true });
        } else {
          await syncService.syncWikiIfNeeded(workspace, { commitMessage: t('LOG.CommitBackupMessage'), force: true });
        }
      },
    },
  ];
}
