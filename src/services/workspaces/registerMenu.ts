import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IViewService } from '@services/view/interface';
import { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkspaceViewService } from '@services/workspacesView/interface';
import { IWorkspaceService } from './interface';

export async function registerMenu(): Promise<void> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const wikiGitWorkspaceService = container.get<IWikiGitWorkspaceService>(serviceIdentifier.WikiGitWorkspace);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);

  await menuService.insertMenu('Workspaces', [
    {
      label: () => i18n.t('Menu.SelectNextWorkspace'),
      click: async () => {
        const currentActiveWorkspace = await workspaceService.getActiveWorkspace();
        if (currentActiveWorkspace === undefined) return;
        const nextWorkspace = await workspaceService.getNextWorkspace(currentActiveWorkspace.id);
        if (nextWorkspace === undefined) return;
        await workspaceViewService.setActiveWorkspaceView(nextWorkspace.id);
      },
      accelerator: 'CmdOrCtrl+Shift+]',
      enabled: async () => (await workspaceService.countWorkspaces()) > 1,
    },
    {
      label: () => i18n.t('Menu.SelectPreviousWorkspace'),
      click: async () => {
        const currentActiveWorkspace = await workspaceService.getActiveWorkspace();
        if (currentActiveWorkspace === undefined) return;
        const previousWorkspace = await workspaceService.getPreviousWorkspace(currentActiveWorkspace.id);
        if (previousWorkspace === undefined) return;
        await workspaceViewService.setActiveWorkspaceView(previousWorkspace.id);
      },
      accelerator: 'CmdOrCtrl+Shift+[',
      enabled: async () => (await workspaceService.countWorkspaces()) > 1,
    },
    { type: 'separator' },
    {
      label: () => i18n.t('WorkspaceSelector.EditCurrentWorkspace'),
      click: async () => {
        const currentActiveWorkspace = await workspaceService.getActiveWorkspace();
        if (currentActiveWorkspace === undefined) return;
        await windowService.open(WindowNames.editWorkspace, { workspaceID: currentActiveWorkspace.id });
      },
      enabled: async () => (await workspaceService.countWorkspaces()) > 0,
    },
    {
      label: () => i18n.t('WorkspaceSelector.ReloadCurrentWorkspace'),
      click: async () => {
        const currentActiveWorkspace = await workspaceService.getActiveWorkspace();
        if (currentActiveWorkspace === undefined) return;
        await viewService.reloadActiveBrowserView();
      },
      enabled: async () => (await workspaceService.countWorkspaces()) > 0,
    },
    {
      label: () => i18n.t('WorkspaceSelector.RemoveCurrentWorkspace'),
      click: async () => {
        const currentActiveWorkspace = await workspaceService.getActiveWorkspace();
        if (currentActiveWorkspace === undefined) return;
        await wikiGitWorkspaceService.removeWorkspace(currentActiveWorkspace.id);
      },
      enabled: async () => (await workspaceService.countWorkspaces()) > 0,
    },
    { type: 'separator' },
    {
      label: () => i18n.t('AddWorkspace.AddWorkspace'),
      click: async () => {
        await windowService.open(WindowNames.addWorkspace);
      },
    },
  ]);
}
