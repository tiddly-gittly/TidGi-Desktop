import { MENUBAR_ICON_PATH } from '@/constants/paths';
import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IViewService } from '@services/view/interface';
import { BrowserWindow, BrowserWindowConstructorOptions, Menu, nativeImage, Tray } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { debounce, merge as mergeDeep } from 'lodash';
import { Menubar, menubar } from 'menubar';
import { IWindowService } from './interface';
import { WindowNames } from './WindowProperties';

export async function handleAttachToMenuBar(windowConfig: BrowserWindowConstructorOptions, windowWithBrowserViewState: windowStateKeeper.State | undefined): Promise<Menubar> {
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const viewService = container.get<IViewService>(serviceIdentifier.View);

  // setImage after Tray instance is created to avoid
  // "Segmentation fault (core dumped)" bug on Linux
  // https://github.com/electron/electron/issues/22137#issuecomment-586105622
  // https://github.com/atomery/translatium/issues/164
  const tray = new Tray(nativeImage.createEmpty());
  // icon template is not supported on Windows & Linux
  tray.setImage(MENUBAR_ICON_PATH);

  const menuBar = menubar({
    index: MAIN_WINDOW_WEBPACK_ENTRY,
    tray,
    activateWithApp: false,
    showDockIcon: true,
    preloadWindow: true,
    tooltip: i18n.t('Menu.TidGiMenuBar'),
    browserWindow: mergeDeep(windowConfig, {
      show: false,
      minHeight: 100,
      minWidth: 250,
    }),
  });

  menuBar.on('after-create-window', () => {
    if (menuBar.window !== undefined) {
      menuBar.window.on('focus', async () => {
        logger.debug('restore window position');
        if (windowWithBrowserViewState === undefined) {
          logger.debug('windowWithBrowserViewState is undefined for menuBar');
        } else {
          if (menuBar.window === undefined) {
            logger.debug('menuBar.window is undefined');
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
        view?.webContents?.focus?.();
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
    (event: { sender: BrowserWindow }) => {
      windowWithBrowserViewState?.saveState(event.sender);
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
