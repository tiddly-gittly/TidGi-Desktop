/**
 * Utility functions for creating Git-related menu items
 * This file is safe to import from both frontend and backend code
 */
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import { DeferredMenuItemConstructorOptions } from '@services/menu/interface';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { TFunction } from 'i18next';

/**
 * Create backup menu items for a workspace (for menubar - returns DeferredMenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param gitService Git service instance (or Pick with commitAndSync)
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @returns Array of menu items
 */
export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  windowService: Pick<IWindowService, 'open'>,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
): DeferredMenuItemConstructorOptions[];

/**
 * Create backup menu items for a workspace (for context menu - returns MenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param gitService Git service instance (or Pick with commitAndSync)
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @param useDeferred Set to false for context menu
 * @returns Array of menu items
 */
export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  windowService: Pick<IWindowService, 'open'>,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
  useDeferred: false,
): import('electron').MenuItemConstructorOptions[];

export function createBackupMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  windowService: Pick<IWindowService, 'open'>,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
  _useDeferred: boolean = true,
): DeferredMenuItemConstructorOptions[] | import('electron').MenuItemConstructorOptions[] {
  if (!isWikiWorkspace(workspace)) {
    return [];
  }

  const { wikiFolderLocation } = workspace;

  if (aiEnabled) {
    return [
      {
        label: t('WorkspaceSelector.ViewGitHistory'),
        click: async () => {
          await windowService.open(WindowNames.gitHistory, { workspaceID: workspace.id });
        },
      },
      { type: 'separator' },
      {
        label: t('ContextMenu.BackupNow'),
        click: async () => {
          await gitService.commitAndSync(workspace, {
            dir: wikiFolderLocation,
            commitOnly: true,
            commitMessage: t('LOG.CommitBackupMessage'),
          });
        },
      },
      {
        label: t('ContextMenu.BackupNow') + t('ContextMenu.WithAI'),
        click: async () => {
          await gitService.commitAndSync(workspace, {
            dir: wikiFolderLocation,
            commitOnly: true,
            // Don't provide commitMessage to trigger AI generation
          });
        },
      },
    ];
  }

  return [
    {
      label: t('WorkspaceSelector.ViewGitHistory'),
      click: async () => {
        await windowService.open(WindowNames.gitHistory, { workspaceID: workspace.id });
      },
    },
    { type: 'separator' },

    {
      label: t('ContextMenu.BackupNow'),
      click: async () => {
        await gitService.commitAndSync(workspace, {
          dir: wikiFolderLocation,
          commitOnly: true,
        });
      },
    },
  ];
}

/**
 * Create sync menu items for a workspace (for menubar - returns DeferredMenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param gitService Git service instance (or Pick with commitAndSync)
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @param isOnline Whether the network is online (optional, defaults to true)
 * @param userInfo User authentication info for git operations
 * @returns Array of menu items
 */
export function createSyncMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
  isOnline: boolean,
  userInfo: IGitUserInfos | undefined,
): DeferredMenuItemConstructorOptions[];

/**
 * Create sync menu items for a workspace (for context menu - returns MenuItemConstructorOptions)
 * @param workspace The workspace to create menu items for
 * @param t Translation function
 * @param gitService Git service instance (or Pick with commitAndSync)
 * @param aiEnabled Whether AI-generated commit messages are enabled
 * @param isOnline Whether the network is online (optional, defaults to true)
 * @param userInfo User authentication info for git operations
 * @param useDeferred Set to false for context menu
 * @returns Array of menu items
 */
export function createSyncMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
  isOnline: boolean,
  userInfo: IGitUserInfos | undefined,
  useDeferred: false,
): import('electron').MenuItemConstructorOptions[];

export function createSyncMenuItems(
  workspace: IWorkspace,
  t: TFunction,
  gitService: Pick<IGitService, 'commitAndSync'>,
  aiEnabled: boolean,
  isOnline: boolean = true,
  userInfo: IGitUserInfos | undefined = undefined,
  _useDeferred: boolean = true,
): DeferredMenuItemConstructorOptions[] | import('electron').MenuItemConstructorOptions[] {
  if (!isWikiWorkspace(workspace) || !workspace.gitUrl) {
    return [];
  }

  const { wikiFolderLocation, gitUrl } = workspace;
  const offlineText = isOnline ? '' : ` (${t('ContextMenu.NoNetworkConnection')})`;

  if (aiEnabled) {
    return [
      {
        label: t('ContextMenu.SyncNow') + offlineText,
        enabled: isOnline,
        click: async () => {
          await gitService.commitAndSync(workspace, {
            dir: wikiFolderLocation,
            commitOnly: false,
            commitMessage: t('LOG.CommitBackupMessage'),
            remoteUrl: gitUrl,
            userInfo,
          });
        },
      },
      {
        label: t('ContextMenu.SyncNow') + t('ContextMenu.WithAI') + offlineText,
        enabled: isOnline,
        click: async () => {
          await gitService.commitAndSync(workspace, {
            dir: wikiFolderLocation,
            commitOnly: false,
            // Don't provide commitMessage to trigger AI generation
            remoteUrl: gitUrl,
            userInfo,
          });
        },
      },
    ];
  }

  return [
    {
      label: t('ContextMenu.SyncNow') + offlineText,
      enabled: isOnline,
      click: async () => {
        await gitService.commitAndSync(workspace, {
          dir: wikiFolderLocation,
          commitOnly: false,
          remoteUrl: gitUrl,
          userInfo,
        });
      },
    },
  ];
}
