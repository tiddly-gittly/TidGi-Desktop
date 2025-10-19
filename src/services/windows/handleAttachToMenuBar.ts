import { MENUBAR_ICON_PATH } from '@/constants/paths';
import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import { BrowserWindowConstructorOptions, Menu, nativeImage, Tray } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { debounce } from 'lodash';
import { Menubar, menubar } from 'menubar';
import type { IWindowService } from './interface';
import { getMainWindowEntry } from './viteEntry';
import { WindowNames } from './WindowProperties';

export async function handleAttachToMenuBar(windowConfig: BrowserWindowConstructorOptions, windowWithBrowserViewState: windowStateKeeper.State | undefined): Promise<Menubar> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);

  // Get menubar-specific titleBar preference
  const showMenubarWindowTitleBar = await preferenceService.get('showMenubarWindowTitleBar');

  // setImage after Tray instance is created to avoid
  // "Segmentation fault (core dumped)" bug on Linux
  // https://github.com/electron/electron/issues/22137#issuecomment-586105622
  // https://github.com/atomery/translatium/issues/164
  const tray = new Tray(nativeImage.createEmpty());
  // icon template is not supported on Windows & Linux
  tray.setImage(MENUBAR_ICON_PATH);

  // Create menubar-specific window configuration
  // Override titleBar settings from windowConfig with menubar-specific preference
  const menubarWindowConfig: BrowserWindowConstructorOptions = {
    ...windowConfig,
    show: false,
    minHeight: 100,
    minWidth: 250,
    // Use menubar-specific titleBar setting instead of inheriting from main window
    titleBarStyle: showMenubarWindowTitleBar ? 'default' : 'hidden',
    frame: showMenubarWindowTitleBar,
    // Always hide the menu bar (File, Edit, View menu), even when showing title bar
    autoHideMenuBar: true,
  };

  logger.info('Creating menubar with titleBar configuration', {
    function: 'handleAttachToMenuBar',
    showMenubarWindowTitleBar,
    titleBarStyle: menubarWindowConfig.titleBarStyle,
    frame: menubarWindowConfig.frame,
  });

  const menuBar = menubar({
    index: getMainWindowEntry(),
    tray,
    activateWithApp: false,
    showDockIcon: true,
    preloadWindow: true,
    tooltip: i18n.t('Menu.TidGiMenuBar'),
    browserWindow: menubarWindowConfig,
  });

  menuBar.on('after-create-window', () => {
    if (menuBar.window !== undefined) {
      menuBar.window.on('focus', async () => {
        logger.debug('restore window position', { function: 'handleAttachToMenuBar' });
        if (windowWithBrowserViewState === undefined) {
          logger.debug('windowWithBrowserViewState is undefined for menuBar', { function: 'handleAttachToMenuBar' });
        } else {
          if (menuBar.window === undefined) {
            logger.debug('menuBar.window is undefined', { function: 'handleAttachToMenuBar' });
          } else {
            const haveXYValue = [windowWithBrowserViewState.x, windowWithBrowserViewState.y].every((value) => Number.isFinite(value));
            const haveWHValue = [windowWithBrowserViewState.width, windowWithBrowserViewState.height].every((value) => Number.isFinite(value));
            if (haveXYValue) {
              menuBar.window.setPosition(windowWithBrowserViewState.x, windowWithBrowserViewState.y, false);
            }
            if (haveWHValue) {
              menuBar.window.setSize(windowWithBrowserViewState.width, windowWithBrowserViewState.height, false);
            }
          }
        }
        const view = await viewService.getActiveBrowserView();
        view?.webContents.focus();
      });
      menuBar.window.removeAllListeners('close');
      menuBar.window.on('close', (event) => {
        event.preventDefault();
        menuBar.hideWindow();
      });
    }
  });
  menuBar.on('hide', async () => {
    // on mac, calling `menuBar.app.hide()` with main window open will bring background main window up, which we don't want. We want to bring previous other app up. So close main window first.
    if (isMac) {
      const mainWindow = windowService.get(WindowNames.main);
      if (mainWindow?.isVisible() === true) {
        await windowService.hide(WindowNames.main);
      }
    }
  });
  // https://github.com/maxogden/menubar/issues/120
  menuBar.on('after-hide', () => {
    if (isMac) {
      menuBar.app.hide();
    }
  });

  // manually save window state https://github.com/mawie81/electron-window-state/issues/64
  const debouncedSaveWindowState = debounce(
    () => {
      if (menuBar.window !== undefined) {
        windowWithBrowserViewState?.saveState(menuBar.window);
      }
    },
    500,
  );
  // menubar is hide, not close, so not managed by windowStateKeeper, need to save manually
  menuBar.window?.on('resize', debouncedSaveWindowState);
  menuBar.window?.on('move', debouncedSaveWindowState);

  return await new Promise<Menubar>((resolve) => {
    menuBar.on('ready', async () => {
      // right on tray icon
      menuBar.tray.on('right-click', () => {
        const contextMenu = Menu.buildFromTemplate([
          {
            label: i18n.t('ContextMenu.OpenTidGi'),
            click: async () => {
              await windowService.open(WindowNames.main);
            },
          },
          {
            label: i18n.t('ContextMenu.OpenTidGiMenuBar'),
            click: async () => {
              await menuBar.showWindow();
            },
          },
          {
            type: 'separator',
          },
          {
            label: i18n.t('ContextMenu.About'),
            click: async () => {
              await windowService.open(WindowNames.about);
            },
          },
          { type: 'separator' },
          {
            label: i18n.t('ContextMenu.Preferences'),
            click: async () => {
              await windowService.open(WindowNames.preferences);
            },
          },
          {
            label: i18n.t('ContextMenu.Notifications'),
            click: async () => {
              await windowService.open(WindowNames.notifications);
            },
          },
          { type: 'separator' },
          {
            label: i18n.t('ContextMenu.Quit'),
            click: () => {
              menuBar.app.quit();
            },
          },
        ]);

        menuBar.tray.popUpContextMenu(contextMenu);
      });

      // right click on window content
      if (menuBar.window?.webContents !== undefined) {
        const unregisterContextMenu = await menuService.initContextMenuForWindowWebContents(menuBar.window.webContents);
        menuBar.on('after-close', () => {
          unregisterContextMenu();
        });
      }

      resolve(menuBar);
    });
  });
}
