import { container } from '@services/container';
import type { IGitService } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';
import type { IMenuService } from '@services/menu/interface';
import { DeferredMenuItemConstructorOptions } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

export async function registerMenu(): Promise<void> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const gitService = container.get<IGitService>(serviceIdentifier.Git);

  const aiGenerateBackupTitleEnabled = await gitService.isAIGenerateBackupTitleEnabled();

  // Build commit menu item (local backup)
  const commitMenuItem: DeferredMenuItemConstructorOptions = aiGenerateBackupTitleEnabled
    ? {
      label: () => i18n.t('ContextMenu.BackupNow'),
      id: 'backup-now',
      submenu: [
        {
          label: () => i18n.t('ContextMenu.BackupNow'),
          click: async () => {
            const activeWorkspace = await workspaceService.getActiveWorkspace();
            if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(activeWorkspace, {
                dir: activeWorkspace.wikiFolderLocation,
                commitOnly: true,
                commitMessage: i18n.t('LOG.CommitBackupMessage'),
              });
            }
          },
        },
        {
          label: () => i18n.t('ContextMenu.BackupNow') + i18n.t('ContextMenu.WithAI'),
          click: async () => {
            const activeWorkspace = await workspaceService.getActiveWorkspace();
            if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(activeWorkspace, {
                dir: activeWorkspace.wikiFolderLocation,
                commitOnly: true,
                // Don't provide commitMessage to trigger AI generation
              });
            }
          },
        },
      ],
    }
    : {
      label: () => i18n.t('ContextMenu.BackupNow'),
      id: 'backup-now',
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
          const gitService = container.get<IGitService>(serviceIdentifier.Git);
          await gitService.commitAndSync(activeWorkspace, {
            dir: activeWorkspace.wikiFolderLocation,
            commitOnly: true,
          });
        }
      },
    };

  // Build sync menu item (cloud sync)
  const syncMenuItem: DeferredMenuItemConstructorOptions = aiGenerateBackupTitleEnabled
    ? {
      label: () => i18n.t('ContextMenu.SyncNow'),
      id: 'sync-now',
      submenu: [
        {
          label: () => i18n.t('ContextMenu.SyncNow'),
          click: async () => {
            const activeWorkspace = await workspaceService.getActiveWorkspace();
            if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace) && activeWorkspace.gitUrl) {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(activeWorkspace, {
                dir: activeWorkspace.wikiFolderLocation,
                commitOnly: false,
                commitMessage: i18n.t('LOG.CommitBackupMessage'),
              });
            }
          },
        },
        {
          label: () => i18n.t('ContextMenu.SyncNow') + i18n.t('ContextMenu.WithAI'),
          click: async () => {
            const activeWorkspace = await workspaceService.getActiveWorkspace();
            if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace) && activeWorkspace.gitUrl) {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(activeWorkspace, {
                dir: activeWorkspace.wikiFolderLocation,
                commitOnly: false,
                // Don't provide commitMessage to trigger AI generation
              });
            }
          },
        },
      ],
    }
    : {
      label: () => i18n.t('ContextMenu.SyncNow'),
      id: 'sync-now',
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace) && activeWorkspace.gitUrl) {
          const gitService = container.get<IGitService>(serviceIdentifier.Git);
          await gitService.commitAndSync(activeWorkspace, {
            dir: activeWorkspace.wikiFolderLocation,
            commitOnly: false,
          });
        }
      },
    };

  // Add to Wiki menu - basic items
  await menuService.insertMenu(
    'Wiki',
    [
      { type: 'separator' },
      {
        label: () => i18n.t('WorkspaceSelector.ViewGitHistory'),
        id: 'git-history',
        click: async () => {
          const activeWorkspace = await workspaceService.getActiveWorkspace();
          if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
            await windowService.open(WindowNames.gitHistory, { workspaceID: activeWorkspace.id });
          }
        },
      },
      commitMenuItem,
      syncMenuItem,
    ],
    undefined,
    undefined,
    'registerGitMenu',
  );

  // Update workspace-specific submenu
  await updateWorkspaceGitMenuItems();
}

async function updateWorkspaceGitMenuItems(): Promise<void> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const gitService = container.get<IGitService>(serviceIdentifier.Git);

  const aiGenerateBackupTitleEnabled = await gitService.isAIGenerateBackupTitleEnabled();
  const workspaces = await workspaceService.getWorkspacesAsList();
  const wikiWorkspaces = workspaces.filter(isWikiWorkspace);

  const workspaceMenuItems: DeferredMenuItemConstructorOptions[] = wikiWorkspaces.map((workspace): DeferredMenuItemConstructorOptions => {
    // Build backup menu item for this workspace
    const workspaceBackupMenuItem: DeferredMenuItemConstructorOptions = aiGenerateBackupTitleEnabled
      ? {
        label: () => i18n.t('ContextMenu.BackupNow'),
        submenu: [
          {
            label: () => i18n.t('ContextMenu.BackupNow'),
            click: async () => {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(workspace, {
                dir: workspace.wikiFolderLocation,
                commitOnly: true,
                commitMessage: i18n.t('LOG.CommitBackupMessage'),
              });
            },
          },
          {
            label: () => i18n.t('ContextMenu.BackupNow') + i18n.t('ContextMenu.WithAI'),
            click: async () => {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(workspace, {
                dir: workspace.wikiFolderLocation,
                commitOnly: true,
                // Don't provide commitMessage to trigger AI generation
              });
            },
          },
        ],
      }
      : {
        label: () => i18n.t('ContextMenu.BackupNow'),
        click: async () => {
          const gitService = container.get<IGitService>(serviceIdentifier.Git);
          await gitService.commitAndSync(workspace, {
            dir: workspace.wikiFolderLocation,
            commitOnly: true,
          });
        },
      };

    // Build sync menu item for this workspace
    const workspaceSyncMenuItem: DeferredMenuItemConstructorOptions = aiGenerateBackupTitleEnabled
      ? {
        label: () => i18n.t('ContextMenu.SyncNow'),
        visible: !!workspace.gitUrl,
        submenu: [
          {
            label: () => i18n.t('ContextMenu.SyncNow'),
            click: async () => {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(workspace, {
                dir: workspace.wikiFolderLocation,
                commitOnly: false,
                commitMessage: i18n.t('LOG.CommitBackupMessage'),
              });
            },
          },
          {
            label: () => i18n.t('ContextMenu.SyncNow') + i18n.t('ContextMenu.WithAI'),
            click: async () => {
              const gitService = container.get<IGitService>(serviceIdentifier.Git);
              await gitService.commitAndSync(workspace, {
                dir: workspace.wikiFolderLocation,
                commitOnly: false,
                // Don't provide commitMessage to trigger AI generation
              });
            },
          },
        ],
      }
      : {
        label: () => i18n.t('ContextMenu.SyncNow'),
        visible: !!workspace.gitUrl,
        click: async () => {
          const gitService = container.get<IGitService>(serviceIdentifier.Git);
          await gitService.commitAndSync(workspace, {
            dir: workspace.wikiFolderLocation,
            commitOnly: false,
          });
        },
      };

    return {
      label: workspace.name,
      submenu: [
        {
          label: () => i18n.t('WorkspaceSelector.ViewGitHistory'),
          click: async () => {
            await windowService.open(WindowNames.gitHistory, { workspaceID: workspace.id });
          },
        },
        workspaceBackupMenuItem,
        workspaceSyncMenuItem,
      ],
    } satisfies DeferredMenuItemConstructorOptions;
  });

  await menuService.insertMenu(
    'Wiki',
    [
      { type: 'separator' },
      {
        label: () => i18n.t('Menu.WikiWorkspaces'),
        id: 'wiki-workspaces-submenu',
        submenu: workspaceMenuItems,
      },
    ],
    undefined,
    undefined,
    'updateWorkspaceGitMenuItems',
  );
}
