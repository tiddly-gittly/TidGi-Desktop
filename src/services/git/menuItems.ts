import { DeferredMenuItemConstructorOptions } from '@services/menu/interface';
import type { ISyncService } from '@services/sync/interface';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { TFunction } from 'i18next';

/**
 * Create backup menu items for a workspace (for menubar - returns DeferredMenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param syncService Sync service instance
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @returns Array of menu items
 */
export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  windowService: Pick<IWindowService, 'open'>,
  syncService: Pick<ISyncService, 'syncWikiIfNeeded'>,
  aiEnabled: boolean,
): DeferredMenuItemConstructorOptions[];

/**
 * Create backup menu items for a workspace (for context menu - returns MenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param syncService Sync service instance
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @param useDeferred Set to false for context menu
 * @returns Array of menu items
 */
export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  windowService: Pick<IWindowService, 'open'>,
  syncService: Pick<ISyncService, 'syncWikiIfNeeded'>,
  aiEnabled: boolean,
  useDeferred: false,
): import('electron').MenuItemConstructorOptions[];

export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  windowService: Pick<IWindowService, 'open'>,
  syncService: Pick<ISyncService, 'syncWikiIfNeeded'>,
  aiEnabled: boolean,
  _useDeferred: boolean = true,
): DeferredMenuItemConstructorOptions[] | import('electron').MenuItemConstructorOptions[] {
  if (!isWikiWorkspace(workspace)) {
    return [];
  }

  const baseItems = [
    {
      label: t('WorkspaceSelector.ViewGitHistory'),
      click: async () => {
        await windowService.open(WindowNames.gitHistory, { workspaceID: workspace.id }, { recreate: true });
      },
    },
    { type: 'separator' as const },
    {
      label: t('ContextMenu.BackupNow'),
      click: async () => {
        await syncService.syncWikiIfNeeded(workspace, { commitMessage: t('LOG.CommitBackupMessage') });
      },
    },
  ];

  if (aiEnabled) {
    baseItems.push({
      label: t('ContextMenu.BackupNow') + t('ContextMenu.WithAI'),
      click: async () => {
        await syncService.syncWikiIfNeeded(workspace, { useAICommitMessage: true });
      },
    });
  }

  return baseItems;
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

  if (aiEnabled) {
    return [
      {
        label: t('ContextMenu.SyncNow') + offlineText,
        enabled: isOnline,
        click: async () => {
          await syncService.syncWikiIfNeeded(workspace, { commitMessage: t('LOG.CommitBackupMessage') });
        },
      },
      {
        label: t('ContextMenu.SyncNow') + t('ContextMenu.WithAI') + offlineText,
        enabled: isOnline,
        click: async () => {
          await syncService.syncWikiIfNeeded(workspace, { useAICommitMessage: true });
        },
      },
    ];
  }

  return [
    {
      label: t('ContextMenu.SyncNow') + offlineText,
      enabled: isOnline,
      click: async () => {
        await syncService.syncWikiIfNeeded(workspace, { commitMessage: t('LOG.CommitBackupMessage') });
      },
    },
  ];
}
