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

  // Build commit menu item
  const commitMenuItem: DeferredMenuItemConstructorOptions = aiGenerateBackupTitleEnabled
    ? {
      label: () => i18n.t('WorkspaceSelector.CommitNow'),
      id: 'commit-now',
      submenu: [
        {
          label: () => i18n.t('WorkspaceSelector.CommitNowQuick'),
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
          label: () => i18n.t('WorkspaceSelector.CommitNowWithAI'),
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
      label: () => i18n.t('WorkspaceSelector.CommitNow'),
      id: 'commit-now',
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

  // Build sync menu item
  const syncMenuItem: DeferredMenuItemConstructorOptions = aiGenerateBackupTitleEnabled
    ? {
      label: () => i18n.t('WorkspaceSelector.SyncNow'),
      id: 'sync-now',
      submenu: [
        {
          label: () => i18n.t('WorkspaceSelector.SyncNowQuick'),
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
          label: () => i18n.t('WorkspaceSelector.SyncNowWithAI'),
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
      label: () => i18n.t('WorkspaceSelector.SyncNow'),
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
  await menuService.insertMenu('Wiki', [
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
  ]);

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
    // Build commit menu item for this workspace
    const workspaceCommitMenuItem: DeferredMenuItemConstructorOptions = aiGenerateBackupTitleEnabled
      ? {
        label: () => i18n.t('ContextMenu.CommitNow'),
        submenu: [
          {
            label: () => i18n.t('WorkspaceSelector.CommitNowQuick'),
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
            label: () => i18n.t('WorkspaceSelector.CommitNowWithAI'),
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
        label: () => i18n.t('ContextMenu.CommitNow'),
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
            label: () => i18n.t('WorkspaceSelector.SyncNowQuick'),
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
            label: () => i18n.t('WorkspaceSelector.SyncNowWithAI'),
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
        workspaceCommitMenuItem,
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
