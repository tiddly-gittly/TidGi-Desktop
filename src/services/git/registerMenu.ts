import { container } from '@services/container';
import type { IGitService } from '@services/git/interface';
import { createBackupMenuItems, createSyncMenuItems } from '@services/git/menuItems';
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
  const activeWorkspace = await workspaceService.getActiveWorkspace();

  // Build commit and sync menu items using utility functions
  const commitMenuItems: DeferredMenuItemConstructorOptions[] = activeWorkspace
    ? createBackupMenuItems(activeWorkspace, i18n.t.bind(i18n), gitService, aiGenerateBackupTitleEnabled).map((item, index) => ({
      ...item,
      id: index === 0 ? 'backup-now' : 'backup-now-ai',
    }))
    : [];

  const syncMenuItems: DeferredMenuItemConstructorOptions[] = activeWorkspace
    ? createSyncMenuItems(activeWorkspace, i18n.t.bind(i18n), gitService, aiGenerateBackupTitleEnabled).map((item, index) => ({
      ...item,
      id: index === 0 ? 'sync-now' : 'sync-now-ai',
    }))
    : [];

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
      ...commitMenuItems,
      ...syncMenuItems,
    ],
    undefined,
    undefined,
    'registerGitMenu',
  );
}
