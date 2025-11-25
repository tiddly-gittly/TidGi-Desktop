import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IContextService } from '@services/context/interface';
import type { IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import type { IMenuService } from '@services/menu/interface';
import { DeferredMenuItemConstructorOptions } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

export async function registerMenu(): Promise<void> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const gitService = container.get<IGitService>(serviceIdentifier.Git);
  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
  const contextService = container.get<IContextService>(serviceIdentifier.Context);

  const hasActiveWikiWorkspace = async (): Promise<boolean> => {
    const activeWorkspace = await workspaceService.getActiveWorkspace();
    return activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace);
  };

  const hasActiveSyncableWorkspace = async (): Promise<boolean> => {
    const activeWorkspace = await workspaceService.getActiveWorkspace();
    if (!activeWorkspace || !isWikiWorkspace(activeWorkspace)) return false;
    if (activeWorkspace.storageService === SupportedStorageServices.local) return false;
    if (!activeWorkspace.gitUrl) return false;
    const userInfo = await authService.getStorageServiceUserInfo(activeWorkspace.storageService);
    return userInfo !== undefined;
  };

  // Build commit and sync menu items with dynamic enabled/click that checks activeWorkspace at runtime
  const commitMenuItems: DeferredMenuItemConstructorOptions[] = [
    {
      label: () => i18n.t('ContextMenu.BackupNow'),
      id: 'backup-now',
      visible: hasActiveWikiWorkspace,
      enabled: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        return activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace);
      },
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
          await gitService.commitAndSync(activeWorkspace, {
            dir: activeWorkspace.wikiFolderLocation,
            commitOnly: true,
            commitMessage: i18n.t('LOG.CommitBackupMessage'),
          });
        }
      },
    },
  ];

  // Add AI backup item if enabled
  const aiGenerateBackupTitleEnabled = await gitService.isAIGenerateBackupTitleEnabled();
  if (aiGenerateBackupTitleEnabled) {
    commitMenuItems.push({
      label: () => i18n.t('ContextMenu.BackupNow') + i18n.t('ContextMenu.WithAI'),
      id: 'backup-now-ai',
      visible: hasActiveWikiWorkspace,
      enabled: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        return activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace);
      },
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
          await gitService.commitAndSync(activeWorkspace, {
            dir: activeWorkspace.wikiFolderLocation,
            commitOnly: true,
            // Don't provide commitMessage to trigger AI generation
          });
        }
      },
    });
  }

  // Build sync menu items
  const syncMenuItems: DeferredMenuItemConstructorOptions[] = [];

  const isOnline = await contextService.isOnline();
  const offlineText = isOnline ? '' : ` (${i18n.t('ContextMenu.NoNetworkConnection')})`;

  if (aiGenerateBackupTitleEnabled) {
    syncMenuItems.push(
      {
        label: () => i18n.t('ContextMenu.SyncNow') + offlineText,
        id: 'sync-now',
        visible: hasActiveSyncableWorkspace,
        enabled: async () => {
          const online = await contextService.isOnline();
          return online && await hasActiveSyncableWorkspace();
        },
        click: async () => {
          const activeWorkspace = await workspaceService.getActiveWorkspace();
          if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
            const userInfo = await authService.getStorageServiceUserInfo(activeWorkspace.storageService);
            await gitService.commitAndSync(activeWorkspace, {
              dir: activeWorkspace.wikiFolderLocation,
              commitOnly: false,
              commitMessage: i18n.t('LOG.CommitBackupMessage'),
              remoteUrl: activeWorkspace.gitUrl ?? undefined,
              userInfo,
            });
          }
        },
      },
      {
        label: () => i18n.t('ContextMenu.SyncNow') + i18n.t('ContextMenu.WithAI') + offlineText,
        id: 'sync-now-ai',
        visible: hasActiveSyncableWorkspace,
        enabled: async () => {
          const online = await contextService.isOnline();
          return online && await hasActiveSyncableWorkspace();
        },
        click: async () => {
          const activeWorkspace = await workspaceService.getActiveWorkspace();
          if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
            const userInfo = await authService.getStorageServiceUserInfo(activeWorkspace.storageService);
            await gitService.commitAndSync(activeWorkspace, {
              dir: activeWorkspace.wikiFolderLocation,
              commitOnly: false,
              // Don't provide commitMessage to trigger AI generation
              remoteUrl: activeWorkspace.gitUrl ?? undefined,
              userInfo,
            });
          }
        },
      },
    );
  } else {
    syncMenuItems.push({
      label: () => i18n.t('ContextMenu.SyncNow') + offlineText,
      id: 'sync-now',
      visible: hasActiveSyncableWorkspace,
      enabled: async () => {
        const online = await contextService.isOnline();
        return online && await hasActiveSyncableWorkspace();
      },
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
          const userInfo = await authService.getStorageServiceUserInfo(activeWorkspace.storageService);
          await gitService.commitAndSync(activeWorkspace, {
            dir: activeWorkspace.wikiFolderLocation,
            commitOnly: false,
            commitMessage: i18n.t('LOG.CommitBackupMessage'),
            remoteUrl: activeWorkspace.gitUrl ?? undefined,
            userInfo,
          });
        }
      },
    });
  }

  // Add to Wiki menu - basic items (each item checks for active wiki workspace)
  await menuService.insertMenu(
    'Wiki',
    [
      { type: 'separator', visible: hasActiveWikiWorkspace },
      {
        label: () => i18n.t('WorkspaceSelector.ViewGitHistory'),
        id: 'git-history',
        visible: hasActiveWikiWorkspace,
        click: async () => {
          const activeWorkspace = await workspaceService.getActiveWorkspace();
          if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
            await windowService.open(WindowNames.gitHistory, { workspaceID: activeWorkspace.id });
          }
        },
      },
      ...commitMenuItems,
      ...syncMenuItems,
    ],
    undefined,
    undefined,
    'registerGitMenu',
  );
}
