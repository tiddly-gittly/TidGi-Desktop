import { WindowChannel } from '@/constants/channels';
import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import getViewBounds from '@services/libs/getViewBounds';
import { i18n } from '@services/libs/i18n';
import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { ipcMain } from 'electron';
import type { IWindowService } from './interface';
import { WindowNames } from './WindowProperties';

export async function registerMenu(): Promise<void> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  await menuService.insertMenu('Window', [
    // `role: 'zoom'` is only supported on macOS
    isMac
      ? {
        role: 'zoom',
      }
      : {
        label: 'Zoom',
        click: async () => {
          await windowService.maximize();
        },
      },
    { role: 'resetZoom' },
    { role: 'togglefullscreen' },
    { role: 'close' },
  ]);

  await menuService.insertMenu(
    'View',
    [
      {
        label: () => i18n.t('Menu.Find'),
        accelerator: 'CmdOrCtrl+F',
        click: async () => {
          const mainWindow = windowService.get(WindowNames.main);
          if (mainWindow !== undefined) {
            mainWindow.webContents.focus();
            mainWindow.webContents.send(WindowChannel.openFindInPage);
            const contentSize = mainWindow.getContentSize();
            const view = await viewService.getActiveBrowserView();
            view?.setBounds(await getViewBounds(contentSize as [number, number], { findInPage: true }));
          }
        },
        enabled: async () => (await workspaceService.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('Menu.FindNext'),
        accelerator: 'CmdOrCtrl+G',
        click: () => {
          const mainWindow = windowService.get(WindowNames.main);
          mainWindow?.webContents.send('request-back-find-in-page', true);
        },
        enabled: async () => (await workspaceService.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('Menu.FindPrevious'),
        accelerator: 'Shift+CmdOrCtrl+G',
        click: () => {
          const mainWindow = windowService.get(WindowNames.main);
          mainWindow?.webContents.send('request-back-find-in-page', false);
        },
        enabled: async () => (await workspaceService.countWorkspaces()) > 0,
      },
      {
        label: () => {
          const alwaysOnTopText = i18n.t('Preference.AlwaysOnTop');
          const requireRestartText = i18n.t('Preference.RequireRestart');
          // Check if i18n is ready
          if (!alwaysOnTopText || !requireRestartText) {
            return 'Always on Top (Require Restart)'; // Fallback
          }
          return `${alwaysOnTopText} (${requireRestartText})`;
        },
        checked: async () => await preferenceService.get('alwaysOnTop'),
        click: async () => {
          const alwaysOnTop = await preferenceService.get('alwaysOnTop');
          await preferenceService.set('alwaysOnTop', !alwaysOnTop);
          await windowService.requestRestart();
        },
      },
    ],
    null,
    true,
  );

  await menuService.insertMenu('History', [
    {
      label: () => i18n.t('Menu.Home'),
      accelerator: 'Shift+CmdOrCtrl+H',
      click: async () => {
        await windowService.goHome();
      },
      enabled: async () => (await workspaceService.countWorkspaces()) > 0,
    },
    {
      label: () => i18n.t('ContextMenu.Back'),
      accelerator: 'CmdOrCtrl+[',
      click: async (_menuItem, browserWindow) => {
        // if back is called in popup window
        // navigate in the popup window instead
        if (browserWindow !== undefined) {
          await windowService.goBack();
        }
        ipcMain.emit('request-go-back');
      },
      enabled: async () => (await workspaceService.countWorkspaces()) > 0,
    },
    {
      label: () => i18n.t('ContextMenu.Forward'),
      accelerator: 'CmdOrCtrl+]',
      click: async (_menuItem, browserWindow) => {
        // if back is called in popup window
        // navigate in the popup window instead
        if (browserWindow !== undefined) {
          // TODO: test if we really can get this isPopup value, and it works for help page popup and tidgi mini window
          // const { isPopup = false } = await getFromRenderer<IBrowserViewMetaData>(MetaDataChannel.getViewMetaData, browserWindow);
          // const windowName = isPopup ? WindowNames.tidgiMiniWindow : WindowNames.main

          await windowService.goForward();
        }
        ipcMain.emit('request-go-forward');
      },
      enabled: async () => (await workspaceService.countWorkspaces()) > 0,
    },
  ]);
}
