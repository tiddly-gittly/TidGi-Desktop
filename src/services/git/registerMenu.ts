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
  // Don't get gitService here to avoid infinite loop - get it in click handlers instead

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
    {
      label: () => i18n.t('WorkspaceSelector.CommitNow'),
      id: 'commit-now',
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace)) {
          // Get gitService here to avoid circular dependency during construction
          const gitService = container.get<IGitService>(serviceIdentifier.Git);
          await gitService.commitAndSync(activeWorkspace, {
            dir: activeWorkspace.wikiFolderLocation,
            commitOnly: true,
          });
        }
      },
    },
    {
      label: () => i18n.t('WorkspaceSelector.SyncNow'),
      id: 'sync-now',
      click: async () => {
        const activeWorkspace = await workspaceService.getActiveWorkspace();
        if (activeWorkspace !== undefined && isWikiWorkspace(activeWorkspace) && activeWorkspace.gitUrl) {
          // Get gitService here to avoid circular dependency during construction
          const gitService = container.get<IGitService>(serviceIdentifier.Git);
          await gitService.commitAndSync(activeWorkspace, {
            dir: activeWorkspace.wikiFolderLocation,
            commitOnly: false,
          });
        }
      },
    },
  ]);

  // Update workspace-specific submenu
  await updateWorkspaceGitMenuItems();
}

async function updateWorkspaceGitMenuItems(): Promise<void> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  // Don't get gitService here to avoid infinite loop - get it in click handlers instead

  const workspaces = await workspaceService.getWorkspacesAsList();
  const wikiWorkspaces = workspaces.filter(isWikiWorkspace);

  const workspaceMenuItems: DeferredMenuItemConstructorOptions[] = wikiWorkspaces.map((workspace): DeferredMenuItemConstructorOptions => {
    return {
      label: workspace.name,
      submenu: [
        {
          label: () => i18n.t('WorkspaceSelector.ViewGitHistory'),
          click: async () => {
            await windowService.open(WindowNames.gitHistory, { workspaceID: workspace.id });
          },
        },
        {
          label: () => i18n.t('ContextMenu.CommitNow'),
          click: async () => {
            // Get gitService here to avoid circular dependency during construction
            const gitService = container.get<IGitService>(serviceIdentifier.Git);
            await gitService.commitAndSync(workspace, {
              dir: workspace.wikiFolderLocation,
              commitOnly: true,
            });
          },
        },
        {
          label: () => i18n.t('ContextMenu.SyncNow'),
          visible: !!workspace.gitUrl,
          click: async () => {
            // Get gitService here to avoid circular dependency during construction
            const gitService = container.get<IGitService>(serviceIdentifier.Git);
            await gitService.commitAndSync(workspace, {
              dir: workspace.wikiFolderLocation,
              commitOnly: false,
            });
          },
        },
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
